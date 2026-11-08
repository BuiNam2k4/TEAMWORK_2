# HỒ SƠ BÀN GIAO — SHOE-STORE (K8S / GITOPS / ARGOCD)

**Dự án:** AI5 – DEVOPS/K8S/TW04  
**Nhóm:** TEAMWORK_2  
**Ngày làm:** 2026-11-08  
**Môi trường lab:** VPS `techbyte` (14.225.37.209), Ubuntu 24.04.4, 16 vCPU / 62 GiB RAM  
**Cluster:** minikube v1.39.0, Kubernetes v1.37.0, driver docker, 3 node (minikube, minikube-m02, minikube-m03)  
**Repo app:** `https://github.com/BuiNam2k4/TEAMWORK_2` (nhánh `test`)  
**Repo manifest:** `https://github.com/ankhang24112411-sudo/manifest-repo` (nhánh `main`)

---

## DL-01 — README + Hướng dẫn chạy lab

### 1.1 Prerequisites (điều kiện trước khi chạy)
- VPS Ubuntu 24.04, ít nhất 4 vCPU / 8 GiB RAM (khuyên dùng 16 vCPU / 62 GiB như lab)
- Docker, git, curl, kubectl, minikube v1.39.0
- GitHub account có quyền push vào repo manifest
- Mạng: cổng 80/443 bị chiếm bởi nginx host, nên Ingress dùng NodePort (30518/32651), truy cập qua `curl -H 'Host: ...' http://<node-ip>:30518`

### 1.2 Cách cài đặt cluster (3 node)
```bash
curl -sfL https://get.k3s.io | sh -   # hoặc minikube nếu dùng lab 1 VPS
minikube node add   # x2 để có 3 node
minikube addons enable ingress
minikube addons enable storage-provisioner-rancher
kubectl get nodes -o wide   # phải thấy 3 node Ready
```

### 1.3 Cách triển khai ứng dụng
```bash
git clone https://github.com/ankhang24112411-sudo/manifest-repo.git
cd manifest-repo
kubectl apply -f k8s/bootstrap/namespaces.yaml
# Tạo db-secret (không commit vào Git):
for ns in staging production; do
  kubectl -n $ns create secret generic db-secret \
    --from-literal=POSTGRES_PASSWORD='<mat-khau>' \
    --from-literal=DATABASE_URL='postgres://shoe:<mat-khau>@postgres:5432/shoe' \
    --from-literal=SESSION_SECRET="$(openssl rand -hex 32)" \
    --from-literal=ADMIN_PASSWORD='<mat-khau>'
done
kubectl apply -k k8s/overlays/staging
kubectl apply -k k8s/overlays/production
```

### 1.4 Cách kiểm tra
```bash
curl -s -o /dev/null -w 'staging HTTP %{http_code}\n' -H 'Host: staging.shoe.test' http://<node-ip>:30518/api/products
curl -s -o /dev/null -w 'production HTTP %{http_code}\n' -H 'Host: shoe.test' http://<node-ip>:30518/api/products
```

---

## DL-02 — System Design (ít nhất 03 sơ đồ)

> [CHÈN 3 SỢ ĐỒ VÀO ĐÂY]

### 2.1 Sơ đồ luồng truy cập (Access Flow)
```
Người dùng ──> Host DNS (staging.shoe.test / shoe.test)
                  │
                  ▼
             Traefik / ingress-nginx (NodePort 30518)
                  │
        ┌─────────┴─────────┐
        ▼                   ▼
    Service api          Service web
   (ClusterIP 3000)    (ClusterIP 80)
        │                   │
    Deployment api    Deployment web
      (1 replica)       (2 replicas)
        │
    Service postgres
   (ClusterIP 5432)
        │
    StatefulSet postgres (1 replica, PVC 2Gi)
```

### 2.2 Sơ đồ triển khai (Deployment View)
> [CHÈN SỢ ĐỒ: pod/api, pod/web ×2, pod/postgres-0 trên 3 node minikube, PVC gắn với node]

### 2.3 Sơ đồ tổ chức cụm 3 node (Cluster Organization)
| Node | IP nội bộ | Vai trò | OS |
|---|---|---|---|
| minikube | 192.168.49.2 | control-plane | Debian 12 |
| minikube-m02 | 192.168.49.3 | worker | Debian 12 |
| minikube-m03 | 192.168.49.4 | worker | Debian 12 |

---

## DL-03 — App source + Dockerfiles

### 3.1 Cấu trúc source
```
TEAMWORK_2/
├── src/               # mã nguồn Express (ESM)
├── public/            # tài nguyên tĩnh (web)
├── sql/schema.sql     # schema PostgreSQL
├── Dockerfile         # build image API (node:20-alpine)
├── Dockerfile.web     # build image Web (nginx:alpine)
├── package.json
└── test/api.test.js   # kiểm thử đơn vị
```

### 3.2 Dockerfiles
- `Dockerfile`: build `ghcr.io/buinam2k4/teamwork_2:v1` và `:v2`
- `Dockerfile.web`: build `ghcr.io/buinam2k4/teamwork_2-web:v1` và `:v2`

### 3.3 Kiểm thử tối thiểu
```bash
npm ci
npm test   # phải pass tất cả test case
```

> [CHÈN LOG CI BUILD/PUSH VÀO ĐÂY]

---

## DL-04 — GitOps manifests + ArgoCD Application

### 4.1 Cấu trúc manifests (trong repo `manifest-repo`)
```
k8s/
├── bootstrap/namespaces.yaml     # staging, production, argocd
├── base/
│   ├── configmap.yaml
│   ├── api.yaml                  # Deployment + Service
│   ├── web.yaml                  # Deployment + Service
│   ├── postgresql.yaml           # Service + StatefulSet + PVC
│   └── kustomization.yaml
├── overlays/staging/             # namespace staging, host staging.shoe.test, tag v1/v2
├── overlays/production/          # namespace production, host shoe.test, tag v1/v2
└── argocd/
    ├── project.yaml              # AppProject shoe-staging, shoe-production
    ├── application-staging.yaml  # ArgoCD Application staging
    └── application-production.yaml # ArgoCD Application production
```

### 4.2 ArgoCD Applications
- `shoe-staging`: target `k8s/overlays/staging`, namespace `staging`
- `shoe-production`: target `k8s/overlays/production`, namespace `production`
- Repo: `https://github.com/ankhang24112411-sudo/manifest-repo`

> [CHÈN SCREENSHOT ARGOCD UI: 2 Application Synced | Healthy]

---

## DL-05 — CI workflow + PR history

### 5.1 CI workflow (`.github/workflows/ci.yml`)
**File:** `.github/workflows/ci.yml` (trong repo `BuiNam2k4/TEAMWORK_2`)

**Kích hoạt (triggers):**
- `push` lên nhánh `main`
- `push` tag khớp mẫu `v*` (ví dụ `v1`, `v2`) → dùng để build image phiên bản chính thức
- `pull_request` vào `main` → chỉ chạy test, **không push image**

**Job `test`:**
1. `actions/checkout@v4`
2. `actions/setup-node@v4` (node-version: 20, cache: npm)
3. `npm ci`
4. `npm test`

**Job `build` (chạy sau khi `test` pass):**
1. `docker/setup-buildx@v3`
2. `docker/login@v3` vào `ghcr.io` (dùng `GITHUB_TOKEN`)
3. `docker/metadata@v5` → sinh tag: `type=ref,event=tag` (khi push tag `v*`), `type=raw,value=latest` (chỉ khi push `main`), `type=sha`
4. `docker/build-push@v6` (ma trận 2 Dockerfile: `Dockerfile` và `Dockerfile.web`)
   - `push: true` chỉ khi sự kiện là `push` (không push trên PR)
   - Images: `ghcr.io/buinam2k4/teamwork_2` (API) và `ghcr.io/buinam2k4/teamwork_2-web` (Web tĩnh)

**Quy tắc then chốt:**
- CI **chỉ push image** khi `push` lên `main` hoặc push tag `v*`. Pull request chỉ chạy test, không push artifact.
- Tag ảnh được gán theo convention semver (`v1`, `v2` …) để ArgoCD có thể promuote môi trường bằng cách thay `newTag` trong `kustomization.yaml` (không dùng `kubectl set image`).

### 5.2 PR history
| PR | Nội dung | Người review | Trạng thái |
|---|---|---|---|
| #4 | Thêm Dockerfile, docker-compose, CI/CD cơ bản | — | merged |
| test branch | Thêm `Dockerfile.web`, thay đổi `ci.yml` (build theo tag `v*`) | — | merged vào test |
| release/staging-v2 | Promote staging `v1` → `v2` qua Git (thay `newTag` trong overlay) | — | merged |
| rollback/staging-v1 | Rollback staging về `v1` qua Git | — | merged |

> [CHÈN SCREENSHOT LOG GitHub Actions: job `test` pass, job `build` push image `:v1` và `:v2` vào GHCR]

---

---

## DL-06 — Evidence Kubernetes

| Tiêu chí | Bằng chứng (file ảnh/log) |
|---|---|
| 3 node Ready | `kubectl get nodes -o wide` → `evidence/nodes.txt` |
| Time sync | `timedatectl` → `evidence/timesync.txt` |
| CNI hoạt động | `kubectl -n kube-system get pods` → `evidence/cni.txt` |
| DNS nội bộ | `nslookup postgres.staging.svc.cluster.local` → `10.100.13.213` |
| Service/Endpoint | `kubectl -n staging get svc,ep` → `evidence/staging.txt` |
| PVC Bound | `kubectl -n staging get pvc` → `Bound`, StorageClass `local-path` |
| Ingress | `kubectl -n staging get ingress` → host `staging.shoe.test`, class `nginx` |
| Probes | readiness `/health/ready`, liveness `/health/live` (không kiểm tra DB) |
| Không hardcode secret | Secret tạo bằng `kubectl create secret`, không commit vào Git |

---

## DL-07 — Demo release / rollback / drift

### 7.1 Release v1 → v2 lần 1 (staging)
- Sửa `newTag: v1` → `v2` trong `overlays/staging/kustomization.yaml`
- Commit, PR, merge vào `main`
- ArgoCD sync tự động, pod web staging đổi sang image `:v2`

### 7.2 Release v1 → v2 lần 2 (production)
- Tương tự trên `overlays/production/kustomization.yaml`

### 7.3 OutOfSync có kiểm soát
- `kubectl -n staging scale deploy web --replicas=5` (trực tiếp cluster)
- ArgoCD hiển thị `OutOfSync | Healthy`, `app diff` hiển thị sự khác biệt
- `kubectl -n argocd app sync shoe-staging` → quay lại `Synced | Healthy`, replicas về 2

### 7.4 Rollback về v1
- Sửa `newTag: v2` → `v1` trong `overlays/staging/kustomization.yaml`
- Commit, PR, merge
- ArgoCD sync, pod web quay lại `v1`

> [CHÈN ẢNH TRƯỚC-SAU VÀ MỐC THỜI GIAN]

---

## DL-08 — Incident report (05 tình huống)

| STT | Tình huống | Hiện tượng | Nguyên nhân | Xử lý | Kết quả verify |
|---|---|---|---|---|---|
| 8.1 | Pod không Ready | Pod `0/1 Ready`, readiness 503 | Readiness probe path sai `/healthzzz` | Sửa probe, rollout restart | `1/1 Ready`, curl 200 |
| 8.2 | Service sai selector | Endpoint rỗng, curl 503 | Selector `app=apinx` ≠ label `app=api` | Sửa selector qua Git | Endpoint có IP, curl 200 |
| 8.3 | ArgoCD OutOfSync | `OutOfSync | Healthy` | `kubectl scale` trực tiếp cluster | `kubectl apply -k` / `app sync` | `Synced | Healthy` |
| 8.4 | Release v2 lỗi nghiệp vụ | Pod Running nhưng `/api/products` 404 | Image v2 là nginx (sai image) | Rollback về `v1` qua Git | `/api/products` 200 |
| 8.5 | Database Pending / mất kết nối | PVC Pending hoặc API mất kết nối DB | StorageClass sai / Secret sai DATABASE_URL | Sửa Secret, restart api | curl 200, dữ liệu còn |

> [CHI TIẾT TỪNG TÌNH HƯỞNG: hiện tượng → giả thuyết → kiểm tra → nguyên nhân → xử lý → verify]

---

## DL-09 — Runbook vận hành và an toàn dữ liệu

### 9.1 Tài khoản/quyền
- ArgoCD: user `admin`, lấy password từ `argocd-initial-admin-secret`
- GitHub: Personal Access Token (read/write repo) cho CI/CD
- Không commit `~/.kube/config` vào repo

### 9.2 Cách restart service
```bash
kubectl -n staging rollout restart deploy/api
kubectl -n staging rollout restart deploy/web
kubectl -n staging rollout restart statefulset/postgres
```

### 9.3 Backup/restore dữ liệu
```bash
# Backup PostgreSQL (trong pod)
kubectl -n staging exec postgres-0 -- pg_dumpall -U shoe > backup.sql

# Restore
kubectl -n staging exec -i postgres-0 -- psql -U shoe < backup.sql
```

### 9.4 Khôi phục sau lỗi
- Lỗi manifest: `kubectl apply -k k8s/overlays/<env>`
- Lỗi image: rollback tag qua Git (`newTag: v1`)
- Lỗi secret: `kubectl -n <ns> create secret generic db-secret ... --dry-run=client -o yaml \| kubectl apply -f -`

---

## DL-10 — Bảng task, ADR, AI_USAGE, báo cáo nhóm

### 10.1 Task board
| Task | Người thực hiện | Deadline | Trạng thái |
|---|---|---|---|
| Xây dựng cluster 3 node | — | — | Done |
| Triển khai staging + production | — | — | Done |
| GitOps ArgoCD | — | — | Done |
| Release v1→v2 (2 lần) | — | — | Done |
| 5 tình huống sự cố | — | — | Doing |
| Docs + báo cáo nhóm | — | — | Todo |

### 10.2 ADR (Architecture Decision Record)
> [CHÈN ADR: tại sao chọn minikube, tại sao chọn ingress-nginx, tại sao dùng local-path, tại sao tách web/api]

### 10.3 AI_USAGE
> [CHÈN: mô tả đã sử dụng AI như thế nào trong bài tập]

### 10.4 Báo cáo nhóm & bài học
> [CHÈN: tổng kết, bài học, điều sẽ làm khác nếu làm lại]

---

## Ký duyệt

| Vai trò | Họ tên | Ký |
|---|---|---|
| PM | | |
| DevOps lead | | |
| Thành viên 1 | | |
| Thành viên 2 | | |
