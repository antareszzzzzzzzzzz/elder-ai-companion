#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# elder-ai-companion 一鍵部署腳本
# 前置條件：AWS Credentials 已 export 且有效
# 用法：
#   ./deploy.sh                       # 部署目前 HEAD
#   ./deploy.sh master                # checkout 指定 branch 後部署
#   ./deploy.sh abc1234               # checkout 指定 commit 後部署
#   ./deploy.sh --auto-approve        # 跳過 CDK 互動核准
#   ./deploy.sh master --auto-approve # 指定 branch + 跳過核准
# =============================================================================

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly EXPECTED_REGION="us-west-2"
readonly EXPECTED_STACK="ElderAiStack"

# --- 顏色輸出 ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

info()  { echo -e "${GREEN}[INFO]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*" >&2; exit 1; }

# --- 解析參數 ---
TARGET_REF=""
AUTO_APPROVE=""

for arg in "$@"; do
  case "$arg" in
    --auto-approve) AUTO_APPROVE="--require-approval never" ;;
    *) TARGET_REF="$arg" ;;
  esac
done

# =============================================================================
# 1. 驗證 AWS Credentials、Account ID、Region
# =============================================================================
info "驗證 AWS Credentials..."

CALLER_IDENTITY=$(aws sts get-caller-identity --output json 2>&1) || \
  error "AWS Credentials 無效或已過期。請重新 export credentials。"

ACCOUNT_ID=$(echo "$CALLER_IDENTITY" | python3 -c "import sys,json; print(json.load(sys.stdin)['Account'])")
CURRENT_REGION=$(aws configure get region 2>/dev/null || echo "${AWS_DEFAULT_REGION:-}")

if [[ "$CURRENT_REGION" != "$EXPECTED_REGION" && "${AWS_DEFAULT_REGION:-}" != "$EXPECTED_REGION" ]]; then
  error "Region 不正確。預期 $EXPECTED_REGION，目前為 ${CURRENT_REGION:-未設定}。請 export AWS_DEFAULT_REGION=$EXPECTED_REGION"
fi

info "AWS Account: $ACCOUNT_ID | Region: $EXPECTED_REGION"

# 確認 Stack 存在（不是要建新的）
STACK_STATUS=$(aws cloudformation describe-stacks --stack-name "$EXPECTED_STACK" \
  --query 'Stacks[0].StackStatus' --output text 2>/dev/null) || \
  error "Stack $EXPECTED_STACK 不存在。本腳本僅更新現有 Stack，不建立新的。"

info "Stack $EXPECTED_STACK 狀態: $STACK_STATUS"

# =============================================================================
# 2. 確認 Git 狀態
# =============================================================================
cd "$SCRIPT_DIR"

if ! git rev-parse --is-inside-work-tree &>/dev/null; then
  error "目前目錄不是 Git repository。"
fi

# 檢查 working tree 是否乾淨（排除 .env 和 infra/node_modules）
DIRTY_FILES=$(git status --porcelain --untracked-files=no | grep -v '\.env' | grep -v 'infra/node_modules' | grep -v 'frontend/node_modules' || true)
if [[ -n "$DIRTY_FILES" ]]; then
  echo "$DIRTY_FILES"
  error "Git working tree 不乾淨（有未提交的改動）。請先 commit 或 stash 後再部署。"
fi

# 切換到指定 branch/commit（如果有指定）
if [[ -n "$TARGET_REF" ]]; then
  info "切換到指定的 ref: $TARGET_REF"
  git fetch origin
  git checkout "$TARGET_REF" || error "無法 checkout $TARGET_REF"
fi

DEPLOY_COMMIT=$(git rev-parse --short HEAD)
DEPLOY_BRANCH=$(git branch --show-current 2>/dev/null || echo "detached")
info "部署 commit: $DEPLOY_COMMIT (branch: $DEPLOY_BRANCH)"

# =============================================================================
# 3. 檢查必要工具
# =============================================================================
info "檢查必要工具..."
command -v docker &>/dev/null || error "Docker 未安裝"
command -v node &>/dev/null   || error "Node.js 未安裝"
command -v npx &>/dev/null    || error "npx 未安裝"
command -v aws &>/dev/null    || error "AWS CLI 未安裝"

# 確認 Docker daemon 在運行
docker info &>/dev/null || error "Docker daemon 未啟動"

info "工具檢查通過 ✓"

# =============================================================================
# 4. 安裝依賴
# =============================================================================
info "安裝 infra 依賴..."
cd "$SCRIPT_DIR/infra"
npm ci --silent

info "安裝 frontend 依賴..."
cd "$SCRIPT_DIR/frontend"
npm ci --silent

# =============================================================================
# 5. 建置前端
# =============================================================================
info "建置前端..."
cd "$SCRIPT_DIR/frontend"
npm run build || error "前端 build 失敗（可能有 TypeScript 錯誤）"
info "前端建置完成 ✓"

# =============================================================================
# 6. CDK synth → diff → deploy
# =============================================================================
cd "$SCRIPT_DIR/infra"

info "CDK synth..."
npx cdk synth --quiet || error "CDK synth 失敗"

info "CDK diff..."
npx cdk diff 2>&1 | head -50 || true

info "CDK deploy..."
if [[ -n "$AUTO_APPROVE" ]]; then
  npx cdk deploy $AUTO_APPROVE || error "CDK deploy 失敗"
else
  info "（需要互動確認。加 --auto-approve 參數可跳過）"
  npx cdk deploy || error "CDK deploy 失敗"
fi

info "CDK deploy 完成 ✓"

# =============================================================================
# 7. 從 CloudFormation Outputs 取得資訊（不硬編碼）
# =============================================================================
info "取得 CloudFormation Outputs..."

get_output() {
  aws cloudformation describe-stacks --stack-name "$EXPECTED_STACK" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text
}

CLOUDFRONT_URL=$(get_output "CloudFrontUrl")
S3_BUCKET=$(get_output "FrontendBucketName")
ALB_URL=$(get_output "AlbUrl")

[[ -z "$CLOUDFRONT_URL" ]] && error "無法取得 CloudFront URL"
[[ -z "$S3_BUCKET" ]] && error "無法取得 S3 Bucket Name"

# 從 CloudFront URL 取得 Distribution ID
CF_DOMAIN=$(echo "$CLOUDFRONT_URL" | sed 's|https://||')
CF_DISTRIBUTION_ID=$(aws cloudfront list-distributions \
  --query "DistributionList.Items[?DomainName=='$CF_DOMAIN'].Id" --output text)

[[ -z "$CF_DISTRIBUTION_ID" ]] && error "無法取得 CloudFront Distribution ID"

info "S3 Bucket: $S3_BUCKET"
info "CloudFront: $CLOUDFRONT_URL (ID: $CF_DISTRIBUTION_ID)"
info "ALB: $ALB_URL"

# =============================================================================
# 8. 上傳前端到 S3
# =============================================================================
info "上傳前端到 S3..."
aws s3 sync "$SCRIPT_DIR/frontend/dist/" "s3://$S3_BUCKET/" --delete --quiet
info "S3 上傳完成 ✓"

# =============================================================================
# 9. 清除 CloudFront 快取
# =============================================================================
info "清除 CloudFront 快取..."
INVALIDATION_ID=$(aws cloudfront create-invalidation \
  --distribution-id "$CF_DISTRIBUTION_ID" \
  --paths "/*" \
  --query 'Invalidation.Id' --output text)
info "CloudFront invalidation 已送出: $INVALIDATION_ID"

# =============================================================================
# 10. 健康檢查
# =============================================================================
info "等待 5 秒後測試 /api/health..."
sleep 5

HEALTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$CLOUDFRONT_URL/api/health" 2>/dev/null || echo "000")

if [[ "$HEALTH_STATUS" == "200" ]]; then
  info "Health check 通過 ✓ (HTTP 200)"
else
  warn "Health check 回傳 HTTP $HEALTH_STATUS（ECS 可能仍在滾動更新中，請稍候再試）"
fi

# =============================================================================
# 完成
# =============================================================================
echo ""
echo -e "${GREEN}══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN} 部署完成！${NC}"
echo -e "${GREEN}══════════════════════════════════════════════════════════${NC}"
echo ""
echo -e " Commit:      ${DEPLOY_COMMIT} (${DEPLOY_BRANCH})"
echo -e " Demo URL:    ${CLOUDFRONT_URL}"
echo -e " API:         ${CLOUDFRONT_URL}/api/health"
echo -e " ALB:         ${ALB_URL}"
echo ""
