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
  model_version: string;
  heating_load: number;
  cooling_load: number;
  disclaimer: string;
};
type MeterPrediction = {
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

function formatValue(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function describeCode(key: FeatureKey, value: number): string {
  if (key === "orientation") return `방향 범주 ${value}`;
  if (key === "glazing_area_distribution") return value === 0 ? "창 없음" : `분포 범주 ${value}`;
  return "";
}

export default function Home() {
  const [mode, setMode] = useState<PredictionMode>("heating");
  const [valuesByMode, setValuesByMode] = useState<Record<PredictionMode, BuildingValues>>({
    heating: { ...initialValues },
    cooling: { ...initialValues },
  });
  const [predictions, setPredictions] = useState<Partial<Record<PredictionMode, Prediction>>>({});
  const [meterPredictions, setMeterPredictions] = useState<Partial<Record<PredictionMode, MeterPrediction>>>({});
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
      const response = await fetch(`${apiBase}/predict`, {
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

      <section className="page-width meter-demo" aria-labelledby="meter-demo-title">
        <div className="meter-demo-heading">
          <p className="section-index">03 <span>실측 자료 시연</span></p>
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
            {meterBuildings.map((building) => (
              <option key={building.building_id} value={building.building_id}>
                {building.building_id} · {building.building_use} · {building.building_area_sqm.toLocaleString("ko-KR")}m²
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
                    <p className="meter-demo-structure">{result.building_use} · {result.building_area_sqm.toLocaleString("ko-KR")}m²</p>
                    <div className="meter-demo-metrics">
                      <span>새 건물 R² {(result.test_r2 * 100).toFixed(1)}%</span>
                      <span>직전값 기준 R² {(result.baseline_test_r2 * 100).toFixed(1)}%</span>
                    </div>
                    <p className="meter-demo-mae">
                      평균 오차(MAE): {result.test_mae.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}
                      {" · "}직전값 기준: {result.baseline_test_mae.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}
                    </p>
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
