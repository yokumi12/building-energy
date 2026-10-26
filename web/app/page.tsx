"use client";

import { FormEvent, useEffect, useState } from "react";

type BuildingValues = {
  relative_compactness: number;
  surface_area: number;
  wall_area: number;
  roof_area: number;
  overall_height: number;
  orientation: number;
  glazing_area: number;
  glazing_area_distribution: number;
};

type FeatureKey = keyof BuildingValues;
type PredictionMode = "heating" | "cooling";
type Prediction = {
  prediction_id: string;
  model_version: string;
  heating_load: number;
  cooling_load: number;
  disclaimer: string;
};
type MeterPrediction = {
  prediction_id: string;
  dataset: string;
  building_id: string;
  target: PredictionMode;
  strategy: "linear_regression" | "hist_gradient_boosting";
  building_area_sqm: number;
  building_use: string;
  forecast_timestamp: string;
  predicted_value: number;
  unit_note: string;
  disclaimer: string;
  test_r2: number;
  test_mae: number;
  baseline_test_r2: number;
  baseline_test_mae: number;
  features: string[];
  selected_iteration: string;
};
type MeterBuilding = {
  building_id: string;
  building_area_sqm: number;
  building_use: string;
};
type ApiState = "checking" | "ready" | "offline";
type ComstockFeature = {
  label: string;
  unit: string;
  kind: "number" | "category";
  min?: number;
  max?: number;
  default: number | string;
  options?: string[];
};
type ComstockMetadata = {
  model_version: string;
  dataset: string;
  features: Record<string, ComstockFeature>;
  test_metrics: Record<PredictionMode, { r2: number; mae_kwh: number; rmse_kwh: number }>;
  disclaimer: string;
};
type ComstockPrediction = {
  prediction_id: string;
  target: PredictionMode;
  predicted_kwh: number;
  test_r2: number;
  test_mae_kwh: number;
  test_rmse_kwh: number;
  disclaimer: string;
};

const initialValues: BuildingValues = {
  relative_compactness: 0.98,
  surface_area: 514.5,
  wall_area: 294,
  roof_area: 110.25,
  overall_height: 7,
  orientation: 2,
  glazing_area: 0,
  glazing_area_distribution: 0,
};

const featureConfig: {
  key: FeatureKey;
  label: string;
  description: string;
  min: number;
  max: number;
  step: number;
  group: "structure" | "window";
}[] = [
  { key: "relative_compactness", label: "상대 컴팩트도", description: "건물 형태의 조밀한 정도", min: 0.62, max: 0.98, step: 0.01, group: "structure" },
  { key: "surface_area", label: "표면적", description: "건물 외피의 전체 표면적", min: 514.5, max: 808.5, step: 0.01, group: "structure" },
  { key: "wall_area", label: "벽면적", description: "건물의 벽면 면적", min: 245, max: 416.5, step: 0.01, group: "structure" },
  { key: "roof_area", label: "지붕면적", description: "건물 지붕의 면적", min: 110.25, max: 220.5, step: 0.01, group: "structure" },
  { key: "overall_height", label: "전체 높이", description: "데이터에 기록된 건물 높이", min: 3.5, max: 7, step: 0.1, group: "structure" },
  { key: "orientation", label: "방향 코드", description: "원본 데이터의 범주 코드", min: 2, max: 5, step: 1, group: "structure" },
  { key: "glazing_area", label: "창면적 비율", description: "전체에서 창이 차지하는 비율", min: 0, max: 0.4, step: 0.01, group: "window" },
  { key: "glazing_area_distribution", label: "창면 분포 코드", description: "원본 데이터의 분포 범주", min: 0, max: 5, step: 1, group: "window" },
];

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8001";
const buildingUseLabels: Record<string, string> = {
  Education: "교육시설",
  "Food sales and service": "식음료 판매·서비스 시설",
  Healthcare: "의료시설",
  "Lodging/residential": "숙박·주거시설",
  Office: "업무시설",
  "Public services": "공공서비스 시설",
};
const comstockCategoryLabels: Record<string, string> = {
  Warehouse: "창고",
  SmallOffice: "소형 사무실",
  MediumOffice: "중형 사무실",
  LargeOffice: "대형 사무실",
  RetailStripmall: "스트립몰 소매점",
  RetailStandalone: "독립형 단독 소매점",
  FullServiceRestaurant: "일반 음식점",
  QuickServiceRestaurant: "패스트푸드점",
  PrimarySchool: "초등학교",
  SecondarySchool: "중·고등학교",
  Outpatient: "외래 진료시설",
  Hospital: "병원",
  SmallHotel: "소형 호텔",
  LargeHotel: "대형 호텔",
  NaturalGas: "천연가스",
  Electricity: "전기",
  NoHeating: "난방 없음",
  FuelOil: "연료유",
  Propane: "프로판",
  DistrictHeating: "지역난방",
  "Baseboard district hot water": "온수식 베이스보드 난방",
  "Baseboard electric": "전기 베이스보드 난방",
  "Baseboard gas boiler": "가스 보일러 온수식 베이스보드 난방",
  "DOAS with VRF": "외기전담시스템(DOAS) + 가변 냉매 유량 시스템(VRF)",
  "DOAS with fan coil air-cooled chiller with boiler": "외기전담시스템 + 팬코일 + 공랭식 냉동기 + 보일러",
  "DOAS with fan coil chiller with boiler": "외기전담시스템 + 팬코일 + 수냉식 냉동기 + 보일러",
  "DOAS with fan coil chiller with district hot water": "외기전담시스템 + 팬코일 + 수냉식 냉동기 + 지역난방 온수",
  "DOAS with fan coil district chilled water with district hot water": "외기전담시스템 + 팬코일 + 지역 냉수·온수",
  "DOAS with water source heat pumps cooling tower with boiler": "외기전담시스템 + 수열원 히트펌프 + 냉각탑 + 보일러",
  "DOAS with water source heat pumps district chilled water with district hot water": "외기전담시스템 + 수열원 히트펌프 + 지역 냉수·온수",
  "DOAS with water source heat pumps with ground source heat pump": "외기전담시스템 + 수열원·지열원 히트펌프",
  "Direct evap coolers with baseboard electric": "직접 증발식 냉각기 + 전기 베이스보드 난방",
  "Direct evap coolers with forced air furnace": "직접 증발식 냉각기 + 강제 송풍식 난방로",
  "Direct evap coolers with gas unit heaters": "직접 증발식 냉각기 + 가스 유닛 히터",
  "Direct evap coolers with no heat": "직접 증발식 냉각기 + 난방 없음",
  "Fan coil air-cooled chiller with baseboard electric": "팬코일 + 공랭식 냉동기 + 전기 베이스보드 난방",
  "Fan coil air-cooled chiller with boiler": "팬코일 + 공랭식 냉동기 + 보일러",
  "Fan coil air-cooled chiller with no heat": "팬코일 + 공랭식 냉동기 + 난방 없음",
  "Fan coil chiller with baseboard electric": "팬코일 + 수냉식 냉동기 + 전기 베이스보드 난방",
  "Fan coil chiller with boiler": "팬코일 + 수냉식 냉동기 + 보일러",
  "Fan coil chiller with district hot water": "팬코일 + 수냉식 냉동기 + 지역난방 온수",
  "Fan coil chiller with no heat": "팬코일 + 수냉식 냉동기 + 난방 없음",
  "Fan coil district chilled water with boiler": "팬코일 + 지역 냉수 + 보일러",
  "Fan coil district chilled water with district hot water": "팬코일 + 지역 냉수·온수",
  "Forced air furnace": "강제 송풍식 난방로",
  "Gas unit heaters": "가스 유닛 히터",
  "PSZ-AC district chilled water with district hot water": "단일구역 정풍량 냉난방기(PSZ-AC) + 지역 냉수·온수",
  "PSZ-AC district chilled water with electric coil": "단일구역 정풍량 냉방기(PSZ-AC) + 지역 냉수 + 전기 코일 난방",
  "PSZ-AC with baseboard district hot water": "단일구역 정풍량 냉방기(PSZ-AC) + 지역난방 온수 베이스보드",
  "PSZ-AC with baseboard electric": "단일구역 정풍량 냉방기(PSZ-AC) + 전기 베이스보드 난방",
  "PSZ-AC with baseboard gas boiler": "단일구역 정풍량 냉방기(PSZ-AC) + 가스 보일러 베이스보드 난방",
  "PSZ-AC with district hot water": "단일구역 정풍량 냉방기(PSZ-AC) + 지역난방 온수",
  "PSZ-AC with electric coil": "단일구역 정풍량 냉방기(PSZ-AC) + 전기 코일 난방",
  "PSZ-AC with gas boiler": "단일구역 정풍량 냉방기(PSZ-AC) + 가스 보일러",
  "PSZ-AC with gas coil": "단일구역 정풍량 냉방기(PSZ-AC) + 가스 코일 난방",
  "PSZ-AC with gas unit heaters": "단일구역 정풍량 냉방기(PSZ-AC) + 가스 유닛 히터",
  "PSZ-AC with no heat": "단일구역 정풍량 냉방기(PSZ-AC) + 난방 없음",
  "PSZ-HP": "단일구역 정풍량 공기열원 히트펌프(PSZ-HP)",
  "PTAC with baseboard district hot water": "패키지형 터미널 에어컨(PTAC) + 지역난방 온수 베이스보드",
  "PTAC with baseboard electric": "패키지형 터미널 에어컨(PTAC) + 전기 베이스보드 난방",
  "PTAC with baseboard gas boiler": "패키지형 터미널 에어컨(PTAC) + 가스 보일러 베이스보드 난방",
  "PTAC with electric coil": "패키지형 터미널 에어컨(PTAC) + 전기 코일 난방",
  "PTAC with gas boiler": "패키지형 터미널 에어컨(PTAC) + 가스 보일러",
  "PTAC with gas coil": "패키지형 터미널 에어컨(PTAC) + 가스 코일 난방",
  "PTAC with gas unit heaters": "패키지형 터미널 에어컨(PTAC) + 가스 유닛 히터",
  "PTAC with no heat": "패키지형 터미널 에어컨(PTAC) + 난방 없음",
  PTHP: "패키지형 터미널 히트펌프(PTHP)",
  "PVAV with PFP boxes": "팬 동력 박스가 있는 변풍량 시스템(PVAV)",
  "PVAV with district hot water reheat": "변풍량 시스템(PVAV) + 지역난방 온수 재열",
  "PVAV with gas boiler reheat": "변풍량 시스템(PVAV) + 가스 보일러 재열",
  "PVAV with gas heat with electric reheat": "변풍량 시스템(PVAV) + 가스 난방·전기 재열",
  "Residential AC with baseboard electric": "주거용 에어컨 + 전기 베이스보드 난방",
  "Residential AC with no heat": "주거용 에어컨 + 난방 없음",
  "Residential AC with residential forced air furnace": "주거용 에어컨 + 주거용 강제 송풍식 난방로",
  "Residential forced air furnace": "주거용 강제 송풍식 난방로",
  "VAV air-cooled chiller with gas boiler reheat": "공랭식 냉동기 변풍량 시스템(VAV) + 가스 보일러 재열",
  "VAV chiller with PFP boxes": "팬 동력 박스가 있는 냉동기 변풍량 시스템(VAV)",
  "VAV chiller with district hot water reheat": "냉동기 변풍량 시스템(VAV) + 지역난방 온수 재열",
  "VAV chiller with gas boiler reheat": "냉동기 변풍량 시스템(VAV) + 가스 보일러 재열",
  "VAV chiller with gas coil reheat": "냉동기 변풍량 시스템(VAV) + 가스 코일 재열",
  "VAV district chilled water with district hot water reheat": "지역 냉수 변풍량 시스템(VAV) + 지역난방 온수 재열",
  "Water source heat pumps cooling tower with boiler": "수열원 히트펌프 + 냉각탑 + 보일러",
  "Water source heat pumps fluid cooler with boiler": "수열원 히트펌프 + 유체 냉각기 + 보일러",
  "Water source heat pumps with ground source heat pump": "수열원 히트펌프 + 지열원 히트펌프",
  "__missing_or_unseen__": "기타·미분류",
};
const stateLabels: Record<string, string> = {
  AK: "알래스카", AL: "앨라배마", AR: "아칸소", AZ: "애리조나",
  CA: "캘리포니아", CO: "콜로라도", CT: "코네티컷", DC: "워싱턴 D.C.",
  DE: "델라웨어", FL: "플로리다", GA: "조지아", HI: "하와이",
  IA: "아이오와", ID: "아이다호", IL: "일리노이", IN: "인디애나",
  KS: "캔자스", KY: "켄터키", LA: "루이지애나", MA: "매사추세츠",
  MD: "메릴랜드", ME: "메인", MI: "미시간", MN: "미네소타",
  MO: "미주리", MS: "미시시피", MT: "몬태나", NC: "노스캐롤라이나",
  ND: "노스다코타", NE: "네브래스카", NH: "뉴햄프셔", NJ: "뉴저지",
  NM: "뉴멕시코", NV: "네바다", NY: "뉴욕", OH: "오하이오",
  OK: "오클라호마", OR: "오리건", PA: "펜실베이니아", RI: "로드아일랜드",
  SC: "사우스캐롤라이나", SD: "사우스다코타", TN: "테네시", TX: "텍사스",
  UT: "유타", VA: "버지니아", VT: "버몬트", WA: "워싱턴주",
  WI: "위스콘신", WV: "웨스트버지니아", WY: "와이오밍",
};
const energyCodeLabels: Record<string, string> = {
  "ComStock DOE Ref Pre-1980": "DOE 기준 모델 · 1980년 이전",
  "ComStock DOE Ref 1980-2004": "DOE 기준 모델 · 1980–2004년",
  "ComStock DEER Pre-1975": "캘리포니아 DEER 기준 · 1975년 이전",
  "ComStock DEER 1985": "캘리포니아 DEER 기준 · 1985년",
  "ComStock DEER 1996": "캘리포니아 DEER 기준 · 1996년",
  "ComStock DEER 2003": "캘리포니아 DEER 기준 · 2003년",
  "ComStock DEER 2007": "캘리포니아 DEER 기준 · 2007년",
  "ComStock DEER 2011": "캘리포니아 DEER 기준 · 2011년",
  "ComStock DEER 2014": "캘리포니아 DEER 기준 · 2014년",
  "ComStock DEER 2015": "캘리포니아 DEER 기준 · 2015년",
  "ComStock DEER 2017": "캘리포니아 DEER 기준 · 2017년",
  "ComStock 90.1-2004": "ASHRAE 90.1 에너지 기준 · 2004년판",
  "ComStock 90.1-2007": "ASHRAE 90.1 에너지 기준 · 2007년판",
  "ComStock 90.1-2010": "ASHRAE 90.1 에너지 기준 · 2010년판",
  "ComStock 90.1-2013": "ASHRAE 90.1 에너지 기준 · 2013년판",
};
const comstockFeatureGroups: { title: string; description: string; keys: string[] }[] = [
  {
    title: "건물·기후 조건",
    description: "건물 유형과 위치에 따른 특성",
    keys: ["in.building_type", "in.sqft", "in.number_of_stories", "in.aspect_ratio", "in.rotation", "in.climate_zone_ashrae_2004", "in.state_abbreviation"],
  },
  {
    title: "냉난방 설비·기준",
    description: "설치된 HVAC 시스템과 교체 당시 기준",
    keys: ["in.hvac_system_type", "in.heating_fuel", "in.energy_code_followed_during_last_hvac_replacement", "in.energy_code_followed_during_last_roof_replacement", "in.energy_code_followed_during_last_walls_replacement", "in.energy_code_followed_during_last_windows_replacement"],
  },
  {
    title: "설정 온도·운영시간",
    description: "온도 설정과 평일·주말 운영 일정",
    keys: ["in.tstat_clg_sp_f", "in.tstat_htg_sp_f", "in.weekday_operating_hours", "in.weekday_opening_time", "in.weekend_operating_hours", "in.weekend_opening_time"],
  },
];

function formatValue(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function formatBuildingUse(buildingUse: string): string {
  return buildingUseLabels[buildingUse] ?? buildingUse;
}

function formatComstockCategory(key: string, value: string): string {
  if (key.startsWith("in.energy_code_followed_")) {
    return energyCodeLabels[value] ?? value;
  }
  if (comstockCategoryLabels[value]) return comstockCategoryLabels[value];
  if (key === "in.climate_zone_ashrae_2004") return `${value} 기후대`;
  if (key === "in.state_abbreviation") return `${stateLabels[value] ?? value} (${value})`;
  return value;
}

function describeCode(key: FeatureKey, value: number): string {
  if (key === "orientation") return `방향 범주 ${value}`;
  if (key === "glazing_area_distribution") return value === 0 ? "창 없음" : `분포 범주 ${value}`;
  return "";
}

type FeedbackModel = "uci_design_load" | "comstock_annual_energy" | "bdg2_next_hour";

function ActualValueForm({
  predictionId,
  model,
  target,
  predictedValue,
  unit,
}: {
  predictionId: string;
  model: FeedbackModel;
  target: PredictionMode;
  predictedValue: number;
  unit: string;
}) {
  const [actualValue, setActualValue] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submitFeedback(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setSubmitting(true);
    try {
      const response = await fetch(`${apiBase}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prediction_id: predictionId,
          model,
          target,
          predicted_value: predictedValue,
          actual_value: Number(actualValue),
        }),
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        const detail = (body as { detail?: unknown }).detail;
        throw new Error(typeof detail === "string" ? detail : "확인된 값을 기록하지 못했습니다.");
      }
      setMessage("확인된 값을 기록했습니다.");
      setActualValue("");
    } catch (requestError) {
      setMessage(requestError instanceof Error ? requestError.message : "값 기록 중 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="feedback-form" onSubmit={submitFeedback}>
      <label>
        <span>나중에 확인된 값{unit ? ` (${unit})` : ""}</span>
        <input
          type="number"
          min="0"
          step="any"
          required
          value={actualValue}
          onChange={(event) => setActualValue(event.target.value)}
        />
      </label>
      <button className="meter-demo-button" type="submit" disabled={submitting}>
        {submitting ? "기록 중..." : "확인값 기록"}
      </button>
      <p>실제 측정값이나 정답을 확보한 경우에만 입력하세요.</p>
      {message && <p role="status">{message}</p>}
    </form>
  );
}

export default function Home() {
  const [mode, setMode] = useState<PredictionMode>("heating");
  const [valuesByMode, setValuesByMode] = useState<Record<PredictionMode, BuildingValues>>({
    heating: { ...initialValues },
    cooling: { ...initialValues },
  });
  const [predictions, setPredictions] = useState<Partial<Record<PredictionMode, Prediction>>>({});
  const [meterPredictions, setMeterPredictions] = useState<Partial<Record<PredictionMode, MeterPrediction>>>({});
  const [comstockMetadata, setComstockMetadata] = useState<ComstockMetadata | null>(null);
  const [comstockValues, setComstockValues] = useState<Record<string, number | string>>({});
  const [comstockPredictions, setComstockPredictions] = useState<Partial<Record<PredictionMode, ComstockPrediction>>>({});
  const [comstockLoading, setComstockLoading] = useState<PredictionMode | null>(null);
  const [comstockError, setComstockError] = useState("");
  const [meterBuildings, setMeterBuildings] = useState<MeterBuilding[]>([]);
  const [meterBuildingCount, setMeterBuildingCount] = useState(0);
  const [selectedMeterBuilding, setSelectedMeterBuilding] = useState("");
  const [meterLoading, setMeterLoading] = useState<PredictionMode | null>(null);
  const [meterError, setMeterError] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [apiState, setApiState] = useState<ApiState>("checking");
  const values = valuesByMode[mode];
  const prediction = predictions[mode] ?? null;

  useEffect(() => {
    let active = true;
    fetch(`${apiBase}/health`)
      .then((response) => {
        if (!response.ok) throw new Error("API health check failed");
        return response.json() as Promise<{ status: string }>;
      })
      .then((body) => {
        if (active) setApiState(body.status === "ok" ? "ready" : "offline");
      })
      .catch(() => {
        if (active) setApiState("offline");
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    fetch(`${apiBase}/meter-model/metadata`)
      .then(async (response) => {
        const body: unknown = await response.json();
        if (!response.ok) {
          const detail = (body as { detail?: unknown }).detail;
          throw new Error(typeof detail === "string" ? detail : "실측 모델 정보를 불러오지 못했습니다.");
        }
        return body as { buildings: MeterBuilding[]; building_count: number };
      })
      .then((body) => {
        if (active) {
          setMeterBuildings(body.buildings);
          setMeterBuildingCount(body.building_count);
          setSelectedMeterBuilding((current) => current || body.buildings[0]?.building_id || "");
        }
      })
      .catch((requestError) => {
        if (active) setMeterError(requestError instanceof Error ? requestError.message : "실측 모델 정보를 불러오지 못했습니다.");
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    fetch(`${apiBase}/comstock/metadata`)
      .then(async (response) => {
        const body: unknown = await response.json();
        if (!response.ok) {
          const detail = (body as { detail?: unknown }).detail;
          throw new Error(typeof detail === "string" ? detail : "ComStock 모델 정보를 불러오지 못했습니다.");
        }
        return body as ComstockMetadata;
      })
      .then((body) => {
        if (active) {
          setComstockMetadata(body);
          setComstockValues(
            Object.fromEntries(
              Object.entries(body.features).map(([key, feature]) => [key, feature.default]),
            ),
          );
        }
      })
      .catch((requestError) => {
        if (active) {
          setComstockError(
            requestError instanceof Error
              ? requestError.message
              : "ComStock 모델 정보를 불러오지 못했습니다.",
          );
        }
      });
    return () => {
      active = false;
    };
  }, []);

  function updateValue(key: FeatureKey, rawValue: string) {
    const value = Number(rawValue);
    if (!Number.isFinite(value)) return;
    setValuesByMode((current) => ({
      ...current,
      [mode]: { ...current[mode], [key]: value },
    }));
    setPredictions((current) => {
      const next = { ...current };
      delete next[mode];
      return next;
    });
    setError("");
  }

  function selectMode(nextMode: PredictionMode) {
    setMode(nextMode);
    setError("");
  }

  function resetCurrentMode() {
    setValuesByMode((current) => ({ ...current, [mode]: { ...initialValues } }));
    setPredictions((current) => {
      const next = { ...current };
      delete next[mode];
      return next;
    });
    setError("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const response = await fetch(`${apiBase}/predict?target=${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        const detail = (body as { detail?: unknown }).detail;
        const message = Array.isArray(detail)
          ? detail.map((item) => (item as { msg?: string }).msg ?? "입력값을 확인해주세요.").join(" ")
          : typeof detail === "string" ? detail : "예측 요청을 처리하지 못했습니다.";
        throw new Error(message);
      }
      setPredictions((current) => ({ ...current, [mode]: body as Prediction }));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "예측 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  async function predictMeter(target: PredictionMode) {
    if (!selectedMeterBuilding) {
      setMeterError("예측할 건물을 선택해주세요.");
      return;
    }
    setMeterError("");
    setMeterLoading(target);
    try {
      const response = await fetch(
        `${apiBase}/meter-model/predict/${target}?building_id=${encodeURIComponent(selectedMeterBuilding)}`,
        { method: "POST" },
      );
      const body: unknown = await response.json();
      if (!response.ok) {
        const detail = (body as { detail?: unknown }).detail;
        throw new Error(typeof detail === "string" ? detail : "실측 자료 예측을 처리하지 못했습니다.");
      }
      setMeterPredictions((current) => ({ ...current, [target]: body as MeterPrediction }));
    } catch (requestError) {
      setMeterError(requestError instanceof Error ? requestError.message : "실측 자료 예측 중 오류가 발생했습니다.");
    } finally {
      setMeterLoading(null);
    }
  }

  async function predictComstock(target: PredictionMode) {
    if (!comstockMetadata) {
      setComstockError("ComStock 모델 정보를 불러오는 중입니다.");
      return;
    }
    setComstockError("");
    setComstockLoading(target);
    try {
      const response = await fetch(`${apiBase}/comstock/predict/${target}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values: comstockValues }),
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        const detail = (body as { detail?: unknown }).detail;
        throw new Error(typeof detail === "string" ? detail : "ComStock 예측을 처리하지 못했습니다.");
      }
      setComstockPredictions((current) => ({ ...current, [target]: body as ComstockPrediction }));
    } catch (requestError) {
      setComstockError(
        requestError instanceof Error ? requestError.message : "ComStock 예측 중 오류가 발생했습니다.",
      );
    } finally {
      setComstockLoading(null);
    }
  }

  function updateComstockValue(key: string, value: number | string) {
    setComstockValues((current) => ({ ...current, [key]: value }));
    setComstockPredictions({});
    setComstockError("");
  }

  const predictedLoad = prediction
    ? mode === "heating" ? prediction.heating_load : prediction.cooling_load
    : null;
  const loadWidth = predictedLoad === null ? 0 : Math.min((predictedLoad / 50) * 100, 100);

  return (
    <main>
      <header className="topbar">
        <div className="page-width topbar-inner">
          <a className="brand" href="#" aria-label="건물 에너지 랩 홈">
            <span className="brand-mark" aria-hidden="true"><span /><span /><span /></span>
            <span><strong>건물 에너지 랩</strong><small>설계 부하 예측</small></span>
          </a>
          <div className={`api-status ${apiState}`} aria-live="polite">
            <span className="status-dot" />
            {apiState === "ready" ? "예측 시스템 연결됨" : apiState === "checking" ? "시스템 연결 확인 중" : "예측 시스템 연결 안 됨"}
          </div>
        </div>
      </header>

      <section className="hero">
        <div className="page-width hero-inner">
          <div className="hero-copy">
            <p className="kicker"><span /> 건물 에너지 설계 도구</p>
            <h1>더 나은 설계,<br /><em>더 똑똑한 에너지.</em></h1>
            <p className="hero-description">예측할 항목을 선택하고<br className="desktop-break" /> 건물 조건에 따른 부하를 확인해보세요.</p>
            <div className="hero-note"><span className="note-icon">i</span> 시뮬레이션 데이터 기반의 교육용 예측입니다.</div>
          </div>
          <div className="building-visual" aria-hidden="true">
            <div className="sun-orbit"><span className="sun" /></div>
            <div className="building-shadow" />
            <div className="building-shape">
              <div className="roof-line" />
              <div className="building-windows"><i /><i /><i /><i /><i /><i /><i /><i /><i /></div>
              <div className="building-door" />
            </div>
            <div className="visual-caption"><span className="caption-line" /> 설계 조건을 바꿔 성능을 확인하세요</div>
          </div>
        </div>
      </section>

      <div className="page-width main-layout">
        <section className="form-panel">
          <div className="panel-heading">
            <div>
              <p className="section-index">01 <span>입력</span></p>
              <h2>건물 조건 설정</h2>
              <p className="section-description">예측할 설계안의 조건을 입력해주세요.</p>
            </div>
            <button className="reset-button" type="button" onClick={resetCurrentMode}>
              <span aria-hidden="true">↺</span> 현재 탭 초기화
            </button>
          </div>

          <div className="mode-tabs" role="tablist" aria-label="예측 항목 선택">
            <button
              id="heating-tab"
              className={`mode-tab heat-tab${mode === "heating" ? " active" : ""}`}
              type="button"
              role="tab"
              aria-selected={mode === "heating"}
              aria-controls="prediction-form"
              tabIndex={mode === "heating" ? 0 : -1}
              onClick={() => selectMode("heating")}
              onKeyDown={(event) => {
                if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
                  event.preventDefault();
                  selectMode("cooling");
                  document.getElementById("cooling-tab")?.focus();
                }
              }}
            >
              <span className="mode-tab-icon" aria-hidden="true">☼</span>
              <span><strong>난방 부하</strong><small>난방 조건 예측</small></span>
            </button>
            <button
              id="cooling-tab"
              className={`mode-tab cool-tab${mode === "cooling" ? " active" : ""}`}
              type="button"
              role="tab"
              aria-selected={mode === "cooling"}
              aria-controls="prediction-form"
              tabIndex={mode === "cooling" ? 0 : -1}
              onClick={() => selectMode("cooling")}
              onKeyDown={(event) => {
                if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
                  event.preventDefault();
                  selectMode("heating");
                  document.getElementById("heating-tab")?.focus();
                }
              }}
            >
              <span className="mode-tab-icon" aria-hidden="true">❄</span>
              <span><strong>냉방 부하</strong><small>냉방 조건 예측</small></span>
            </button>
          </div>

          <form id="prediction-form" role="tabpanel" aria-labelledby={`${mode}-tab`} onSubmit={submit}>
            <div className="input-group">
              <div className="group-title"><span className="group-icon structure-icon">▦</span><div><h3>건물 구조</h3><p>형태와 규모에 관한 조건</p></div></div>
              <div className="field-grid">
                {featureConfig.filter((field) => field.group === "structure").map((field) => (
                  <label className="field" key={field.key}>
                    <span className="field-label">{field.label}<span className="field-info" title={field.description}>i</span></span>
                    {field.key === "orientation" ? (
                      <select value={values[field.key]} onChange={(event) => updateValue(field.key, event.target.value)} aria-label={field.label}>
                        {[2, 3, 4, 5].map((option) => <option key={option} value={option}>{describeCode(field.key, option)}</option>)}
                      </select>
                    ) : (
                      <input type="number" min={field.min} max={field.max} step={field.step} value={values[field.key]} onChange={(event) => updateValue(field.key, event.target.value)} required aria-label={field.label} />
                    )}
                    <span className="field-range">데이터 범위 {formatValue(field.min)}–{formatValue(field.max)}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="input-group window-group">
              <div className="group-title"><span className="group-icon window-icon">▤</span><div><h3>창면 조건</h3><p>창의 면적과 분포</p></div></div>
              <div className="field-grid window-grid">
                {featureConfig.filter((field) => field.group === "window").map((field) => (
                  <label className="field" key={field.key}>
                    <span className="field-label">{field.label}<span className="field-info" title={field.description}>i</span></span>
                    {field.key === "glazing_area_distribution" ? (
                      <select value={values[field.key]} onChange={(event) => updateValue(field.key, event.target.value)} aria-label={field.label}>
                        {[0, 1, 2, 3, 4, 5].map((option) => <option key={option} value={option}>{describeCode(field.key, option)}</option>)}
                      </select>
                    ) : (
                      <input type="number" min={field.min} max={field.max} step={field.step} value={values[field.key]} onChange={(event) => updateValue(field.key, event.target.value)} required aria-label={field.label} />
                    )}
                    <span className="field-range">데이터 범위 {formatValue(field.min)}–{formatValue(field.max)}</span>
                  </label>
                ))}
              </div>
            </div>

            <button className="predict-button" type="submit" disabled={loading || apiState === "offline"}>
              <span>{loading ? "결과 계산 중" : `${mode === "heating" ? "난방" : "냉방"} 부하 예측`}</span>
              <span className="button-arrow" aria-hidden="true">{loading ? "…" : "→"}</span>
            </button>
            {apiState === "offline" && <p className="inline-error">예측 API가 실행 중인지 확인해주세요. 실행 안내는 프로젝트 README를 참고하세요.</p>}
          </form>
        </section>

        <aside className="result-column">
          <section className="result-panel" aria-live="polite">
            <div className="panel-heading result-heading">
              <div>
                <p className="section-index">02 <span>결과</span></p>
                <h2>{prediction ? `${mode === "heating" ? "난방" : "냉방"} 예측 결과` : `${mode === "heating" ? "난방" : "냉방"} 설계안 미리보기`}</h2>
                <p className="section-description">{prediction ? "선택한 항목의 예측값입니다." : "조건을 입력하면 선택한 부하가 표시됩니다."}</p>
              </div>
              {prediction && <span className="result-tag">모델 결과</span>}
            </div>

            {prediction ? (
              <>
                <div className={`metric-card ${mode === "heating" ? "heat-card" : "cool-card"}`}>
                  <div className="metric-top">
                    <span className={`metric-symbol ${mode === "heating" ? "heat-symbol" : "cool-symbol"}`}>{mode === "heating" ? "☼" : "❄"}</span>
                    <span className="metric-label">예상 {mode === "heating" ? "난방" : "냉방"} 부하</span>
                    <span className="metric-arrow">↗</span>
                  </div>
                  <div className="metric-value">{predictedLoad?.toFixed(2)}<small>데이터 값</small></div>
                  <div className="metric-track"><span style={{ width: `${loadWidth}%` }} /></div>
                  <div className="metric-scale"><span>0</span><span>원본 데이터 범위 기준 시각화</span><span>50</span></div>
                </div>
                <div className="model-caption"><span className="model-caption-dot" /><span>사용 모델</span><strong>{prediction.model_version}</strong></div>
                <p className="result-disclaimer">{prediction.disclaimer}</p>
                <ActualValueForm
                  predictionId={prediction.prediction_id}
                  model="uci_design_load"
                  target={mode}
                  predictedValue={predictedLoad ?? 0}
                  unit=""
                />
              </>
            ) : (
              <div className="empty-result">
                <div className="empty-illustration">
                  <span className={mode === "heating" ? "empty-sun" : "empty-snow"}>{mode === "heating" ? "☼" : "❄"}</span>
                  <div className="empty-house"><i /><i /><i /><i /></div>
                </div>
                <strong>아직 예측 결과가 없습니다</strong>
                <p>왼쪽에서 {mode === "heating" ? "난방" : "냉방"} 조건을 확인하고<br />예측 버튼을 눌러보세요.</p>
                <div className="empty-footer"><span>{mode === "heating" ? "난방 부하 예측" : "냉방 부하 예측"}</span></div>
              </div>
            )}
          </section>
          <div className="dataset-card">
            <div className="dataset-icon">D</div>
            <div><strong>데이터 기반 모델</strong><p>768개 건물 설계 시뮬레이션 사례</p></div>
            <span className="dataset-check">✓</span>
          </div>
          <p className="unit-note">※ 원본 데이터에는 예측값의 물리 단위가 명시되어 있지 않습니다.</p>
        </aside>
      </div>

      <section className="page-width meter-demo comstock-model" aria-labelledby="comstock-title">
        <div className="meter-demo-heading">
          <p className="section-index">03 <span>ComStock 연간 에너지 예측</span></p>
          <h2 id="comstock-title">건물 특성으로 연간 난방·냉방 에너지 예측</h2>
          <p>
            미국 ComStock 시뮬레이션 데이터로 학습한 별도 모델입니다.
            {comstockMetadata ? ` 시험 R²: 난방 ${(comstockMetadata.test_metrics.heating.r2 * 100).toFixed(1)}%, 냉방 ${(comstockMetadata.test_metrics.cooling.r2 * 100).toFixed(1)}%.` : ""}
          </p>
        </div>
        {comstockMetadata ? (
          <>
            <div className="comstock-feature-groups">
              {comstockFeatureGroups.map((group) => (
                <fieldset className="comstock-feature-group" key={group.title}>
                  <legend>{group.title}</legend>
                  <p>{group.description}</p>
                  <div className="comstock-field-grid">
                    {group.keys.map((key) => {
                      const feature = comstockMetadata.features[key];
                      if (!feature) return null;
                      const value = comstockValues[key] ?? feature.default;
                      return (
                        <label className="comstock-field" key={key}>
                          <span>{feature.label}{feature.unit ? ` (${feature.unit})` : ""}</span>
                          {feature.kind === "category" ? (
                            <select
                              value={String(value)}
                              onChange={(event) => updateComstockValue(key, event.target.value)}
                            >
                              {(feature.options ?? []).map((option) => (
                                <option key={option} value={option}>
                                  {formatComstockCategory(key, option)}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input
                              type="number"
                              min={feature.min}
                              max={feature.max}
                              step={key.includes("operating_hours") || key.includes("opening_time") ? 0.25 : "any"}
                              value={Number(value)}
                              onChange={(event) => updateComstockValue(key, Number(event.target.value))}
                            />
                          )}
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              ))}
            </div>
            <div className="comstock-results">
              {(["heating", "cooling"] as const).map((target) => {
                const result = comstockPredictions[target];
                const targetLabel = target === "heating" ? "난방" : "냉방";
                const metric = comstockMetadata.test_metrics[target];
                return (
                  <article className={`comstock-result ${target}`} key={target}>
                    <div className="comstock-result-heading">
                      <strong>{targetLabel} 에너지</strong>
                      <span>시험 R² {(metric.r2 * 100).toFixed(1)}%</span>
                    </div>
                    {result ? (
                      <>
                        <p className="comstock-result-value">
                          {result.predicted_kwh.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}
                          <small> kWh/년</small>
                        </p>
                        <p className="comstock-result-error">
                          시험 MAE {result.test_mae_kwh.toLocaleString("ko-KR", { maximumFractionDigits: 0 })} kWh
                        </p>
                        <ActualValueForm
                          predictionId={result.prediction_id}
                          model="comstock_annual_energy"
                          target={target}
                          predictedValue={result.predicted_kwh}
                          unit="kWh/년"
                        />
                      </>
                    ) : (
                      <p className="comstock-result-placeholder">입력한 조건의 연간 사용량을 예측합니다.</p>
                    )}
                    <button
                      className="meter-demo-button"
                      type="button"
                      disabled={comstockLoading !== null || !comstockMetadata}
                      onClick={() => predictComstock(target)}
                    >
                      {comstockLoading === target ? "계산 중..." : `${targetLabel} 연간 에너지 예측`}
                    </button>
                  </article>
                );
              })}
            </div>
            {comstockError && <p className="inline-error" role="alert">{comstockError}</p>}
            <p className="meter-demo-note">{comstockMetadata.disclaimer} R²는 정확도가 아니라 회귀 성능 지표입니다.</p>
          </>
        ) : (
          <p className="inline-error" role="status">{comstockError || "ComStock 모델 정보를 불러오는 중입니다."}</p>
        )}
      </section>

      <section className="page-width meter-demo" aria-labelledby="meter-demo-title">
        <div className="meter-demo-heading">
          <p className="section-index">04 <span>실측 자료 시연</span></p>
          <h2 id="meter-demo-title">특성(Feature)으로 다음 시간 값 예측하기</h2>
          <p>정답(Target)은 다음 시간의 계량값입니다. 난방과 냉방을 각각 예측합니다.</p>
        </div>
        <label className="meter-building-select">
          <span>예측할 건물 선택</span>
          <select
            value={selectedMeterBuilding}
            onChange={(event) => {
              setSelectedMeterBuilding(event.target.value);
              setMeterPredictions({});
            }}
            disabled={meterBuildings.length === 0}
          >
            {meterBuildings.map((building, index) => (
              <option key={building.building_id} value={building.building_id}>
                건물 {index + 1} · {formatBuildingUse(building.building_use)} · {building.building_area_sqm.toLocaleString("ko-KR")}m²
              </option>
            ))}
          </select>
        </label>
        <div className="meter-demo-actions">
          {(["heating", "cooling"] as const).map((target) => {
            const result = meterPredictions[target];
            const label = target === "heating" ? "난방" : "냉방";
            return (
              <article className={`meter-demo-card ${target}`} key={target}>
                <div className="meter-demo-card-title">
                  <span aria-hidden="true">{target === "heating" ? "☼" : "❄"}</span>
                  <strong>{label}</strong>
                  <small>{target === "heating" ? "증기 계량" : "냉수 계량"}</small>
                </div>
                {result ? (
                  <>
                    <p className="meter-demo-value">{result.predicted_value.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}</p>
                    <p className="meter-demo-time">예측 시각: {result.forecast_timestamp.replace("T", " ")}</p>
                    <p className="meter-demo-structure">{formatBuildingUse(result.building_use)} · {result.building_area_sqm.toLocaleString("ko-KR")}m²</p>
                    <div className="meter-demo-metrics">
                      <span>새 건물 R² {(result.test_r2 * 100).toFixed(1)}%</span>
                      <span>직전값 기준 R² {(result.baseline_test_r2 * 100).toFixed(1)}%</span>
                    </div>
                    <p className="meter-demo-mae">
                      평균 오차(MAE): {result.test_mae.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}
                      {" · "}직전값 기준: {result.baseline_test_mae.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}
                    </p>
                    <ActualValueForm
                      predictionId={result.prediction_id}
                      model="bdg2_next_hour"
                      target={target}
                      predictedValue={result.predicted_value}
                      unit="원본 계량 단위 미확인"
                    />
                  </>
                ) : (
                  <p className="meter-demo-placeholder">버튼을 누르면 예측값을 보여줍니다.</p>
                )}
                <button
                  className="meter-demo-button"
                  type="button"
                  disabled={meterLoading !== null || apiState !== "ready" || !selectedMeterBuilding}
                  onClick={() => predictMeter(target)}
                >
                  {meterLoading === target ? "계산 중..." : `${label} 다음 값 보기`}
                </button>
              </article>
            );
          })}
        </div>
        {meterError && <p className="inline-error" role="alert">{meterError}</p>}
        <p className="meter-demo-note">
          미국 한 지역의 건물 {meterBuildingCount}곳으로 학습하고, 따로 둔 새 건물 9곳으로 평가했습니다.
          R²는 회귀 모델이 값의 차이를 얼마나 설명하는지 나타내는 점수이며 분류 정확도와 다릅니다.
          계량값의 물리 단위는 확인되지 않았고, 자료는 2017년 말에 끝나는 학습용 시연입니다.
        </p>
      </section>

      <footer className="page-footer">
        <div className="page-width footer-inner"><span>건물 에너지 랩</span><span>교육용 시연 · 실제 건물의 에너지 사용량을 보장하지 않습니다.</span></div>
      </footer>
      {error && <div className="toast-error" role="alert"><span>!</span>{error}<button type="button" onClick={() => setError("")} aria-label="오류 닫기">×</button></div>}
    </main>
  );
}
