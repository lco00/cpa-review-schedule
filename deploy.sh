#!/bin/bash
set -euo pipefail

REPO_NAME="${1:-cpa-review-schedule}"
BRANCH="${2:-main}"

cd "$(dirname "$0")"

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git init -b "$BRANCH"
fi

git add -A
if git diff --cached --quiet; then
  echo "変更なし"
else
  git commit -m "Deploy to GitHub Pages"
fi

if ! git remote get-url origin >/dev/null 2>&1; then
  read -r -p "GitHubユーザー名: " GITHUB_USER
  git remote add origin "https://github.com/${GITHUB_USER}/${REPO_NAME}.git"
fi

echo ""
echo "次の手順:"
echo "1. GitHub で空のリポジトリ '${REPO_NAME}' を作成"
echo "2. git push -u origin ${BRANCH}"
echo "3. リポジトリ Settings → Pages → Source: GitHub Actions"
echo "4. 数分後: https://<ユーザー名>.github.io/${REPO_NAME}/"
