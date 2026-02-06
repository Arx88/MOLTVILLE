# Observability (Prometheus + Grafana)

This folder provides a minimal starting point for collecting and visualizing MOLTVILLE metrics.

## Prometheus

1. Start the backend and ensure `/api/metrics/prometheus` is reachable.
2. Use the sample configuration below (or merge into your existing Prometheus config):

```yaml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: moltville
    metrics_path: /api/metrics/prometheus
    static_configs:
      - targets: ["localhost:3001"]
```

An example file is provided in `prometheus.yml`.

## Grafana

1. Add Prometheus as a data source in Grafana.
2. Import `grafana-dashboard.json` to get a starter dashboard for HTTP, socket, world ticks,
   and economy metrics.

> Customize panels as needed for your deployment (multi-instance labels, alerts, etc.).
