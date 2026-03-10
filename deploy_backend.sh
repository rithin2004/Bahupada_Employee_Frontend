#!/bin/bash

echo "🚀 Deploying Bahu Backend to EC2..."

rsync -avz --delete \
  --exclude '.venv' \
  --exclude 'node_modules' \
  --exclude '.git' \
  --exclude '__pycache__' \
  --exclude '.env' \
  -e "ssh -i ~/.ssh/ec2-keys/bahu-key-ohio.pem -o StrictHostKeyChecking=no" \
  /Users/sainath/projects/bahu/apps/backend/ ubuntu@3.144.231.136:~/backend

echo "🔄 Rebuilding and restarting Docker container..."
ssh -i ~/.ssh/ec2-keys/bahu-key-ohio.pem ubuntu@3.144.231.136 << 'EOF'
  cd ~/backend
  
  cat << 'INNER_EOF' > Dockerfile
FROM python:3.11-slim
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/
WORKDIR /app
COPY pyproject.toml .
RUN uv pip install --system fastapi "uvicorn[standard]" boto3 sqlalchemy asyncpg alembic pydantic pydantic-settings "python-jose[cryptography]" "passlib[argon2]" "passlib[bcrypt]" python-multipart celery openpyxl bcrypt httpx
COPY . .
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
INNER_EOF

  docker build -t bahu-backend .
  docker stop bahu-api || true
  docker rm bahu-api || true
  docker run -d --name bahu-api --restart always -p 8000:8000 --env-file .env bahu-backend
  
  echo "✅ Deployment Successful! API is live."
