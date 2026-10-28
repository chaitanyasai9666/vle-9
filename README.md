# VLE-9: Secure DevSecOps Implementation in Healthcare Systems

A DevSecOps pipeline for a healthcare (PHI) application using **Jenkins, Docker, Kubernetes, SonarQube (SAST), Trivy (container scanning), OWASP ZAP (DAST) and Prometheus + Grafana (monitoring and alerting)** on AWS EC2.

## Repository layout

```
app/server.js              Step 3 – patient-records API: input validation, no hardcoded secrets, PHI masking, security headers, /metrics
app/package.json
sonar-project.properties   Step 4 – SonarQube project config
Dockerfile.baseline        Step 5 – image from the lab manual (node:18-alpine + non-root user)
Dockerfile                 Step 5 – hardened image (Node 24 LTS, patched, npm removed, non-root, read-only app files, HEALTHCHECK)
k8s/namespace.yaml         Step 7 – namespace with Pod Security Admission "restricted"
k8s/rbac.yaml              Step 7 – ServiceAccount + Role allowing only `get secret/db-secret`
k8s/deployment.yaml        Step 7 – hardened Deployment (non-root, read-only root FS, no privilege escalation, caps dropped, limits) + Service
monitoring/values.yaml     Step 9 – kube-prometheus-stack Helm values
monitoring/servicemonitor.yaml  Step 9 – Prometheus scrapes the app's /metrics
monitoring/alerts.yaml     Step 9 – UnauthorizedAccessDetected, FailedLoginsSpike, HighCPUUsage
monitoring/dashboard.json  Step 9 – Grafana "Healthcare Security (VLE-9)" dashboard
Jenkinsfile                Step 10 – Build → SAST → Security Scan (Trivy gate) → Deploy → DAST
scripts/install-devsecops.sh  Step 2 – tool installation on Ubuntu 24.04
```

The Kubernetes Secret `db-secret` is **not** in this repo. It is created from random values at deploy time:

```bash
kubectl create secret generic db-secret -n healthcare --type=Opaque \
  --from-literal=password="$(openssl rand -base64 18)" \
  --from-literal=api-token="$(openssl rand -hex 24)"
```

## Results

| Step | Tool | Result |
|---|---|---|
| 1 | AWS | t3.xlarge, KMS-encrypted EBS, IMDSv2 required, least-privilege IAM role (SSM only), SG: SSH via EC2 Instance Connect only, web UIs from one IP only |
| 3–4 | SonarQube | First scan: 2 security issues (High: `eval`, Medium: weak PRNG) in an insecure legacy module → removed → re-scan: Security 0, all ratings A, quality gate Passed |
| 5–6 | Trivy | Manual's `node:18-alpine` image: **44 HIGH/CRITICAL** CVEs → hardened image: **0**; Dockerfile misconfigurations 0 |
| 7 | Kubernetes | RBAC allows only `get secret/db-secret`; a `--privileged` pod is rejected by Pod Security "restricted" |
| 8 | OWASP ZAP | Baseline scan: **FAIL 0, WARN 1, PASS 67** |
| 9 | Prometheus/Grafana | Simulated attack fired all 3 alerts: UnauthorizedAccessDetected, FailedLoginsSpike, HighCPUUsage |
| 10 | Jenkins | Pipeline build #1: all 5 stages green, **Finished: SUCCESS** |

## Notes

- SonarQube Community edition does not run every injection/secret rule; Trivy's secret scanner covers hardcoded secrets.
- Minikube's default CNI does not enforce NetworkPolicy, so none is included (it would not be enforced).
