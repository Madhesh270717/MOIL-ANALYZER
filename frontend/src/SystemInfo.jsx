import { useEffect, useState } from "react";
import { apiGet } from "./api";
import { ErrorState, Loader } from "./ui";

const METRIC_LABELS = {
  classification: [
    ["accuracy", "Accuracy"],
    ["roc_auc", "ROC-AUC"],
    ["precision", "Precision"],
    ["recall", "Recall"],
    ["f1", "F1"],
  ],
  regression: [
    ["r2", "R²"],
    ["mae", "MAE (t)"],
    ["rmse", "RMSE (t)"],
  ],
};

function ModelCard({ model }) {
  const metricRows = METRIC_LABELS[model.task] || [];
  return (
    <div className="model-card">
      <div className="model-head">
        <strong>{model.name}</strong>
        <span className="model-task">
          {model.task === "classification" ? "Classification" : "Regression"}
        </span>
      </div>

      {model.available ? (
        <>
          <dl className="metric-grid">
            {metricRows
              .filter(([key]) => model.metrics?.[key] !== undefined)
              .map(([key, label]) => (
                <div key={key}>
                  <dt>{label}</dt>
                  <dd>{model.metrics[key]}</dd>
                </div>
              ))}
          </dl>
          <p className="model-meta">
            Held-out {model.rows?.test} of {model.rows?.total} rows · target:{" "}
            {model.target}
          </p>
        </>
      ) : (
        <p className="muted">
          Validation metrics not available from the saved artifacts
          {model.reason ? ` (${model.reason})` : ""}.
        </p>
      )}

      <p className="model-note">{model.note}</p>
    </div>
  );
}

export function SystemInfoPanel() {
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    apiGet("/api/system-info")
      .then((data) => {
        if (cancelled) return;
        setInfo(data);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <Loader message="Loading data & model information…" />;
  if (error)
    return (
      <ErrorState message="Failed to load data & model information." hint={error} />
    );

  return (
    <div className="system-col">
      <h4 className="system-subtitle">
        Model validation — recomputed on the original held-out split
      </h4>
      {info.models.map((model) => (
        <ModelCard key={model.name} model={model} />
      ))}

      <div className="note-card note-warn">
        <span className="note-title">Honest limitations</span>
        <ul className="limitation-list">
          {info.synthetic_notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
          <li>
            These scores come from small reference datasets and are not a
            production-grade performance guarantee.
          </li>
        </ul>
      </div>
    </div>
  );
}
