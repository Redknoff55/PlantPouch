# Docker Deployment Guide

This guide covers two deployment options: GitHub Container Registry (automatic) and Docker Hub (manual).

---

## Option 1: GitHub Container Registry (Automatic)

The included GitHub Actions workflow automatically builds and pushes images when you push to `main` or create a release.

### Setup

1. **Push this repo to GitHub**
2. **Enable GitHub Packages** (usually enabled by default)
3. **Push to main branch** - the image will build automatically

### Deployment

1. Copy `docker-compose.deploy.yml` to your server
2. Create a `.env` file (see Environment Variables below)
3. Update the image name in `docker-compose.deploy.yml`:
   ```yaml
   image: ghcr.io/YOUR_GITHUB_USERNAME/YOUR_REPO_NAME:latest
   ```
4. Run:
   ```bash
   docker compose -f docker-compose.deploy.yml up -d
   ```

### First-time database setup
```bash
docker compose -f docker-compose.deploy.yml exec app npx drizzle-kit push
```

---

## Option 2: Docker Hub (Manual)

### One-time Setup

1. Create a Docker Hub account at https://hub.docker.com
2. Create a repository called `equipmanager`

### Build and Push

```bash
# Log in to Docker Hub
docker login

# Build the image
docker build -t YOUR_DOCKERHUB_USERNAME/equipmanager:latest .

# Push to Docker Hub
docker push YOUR_DOCKERHUB_USERNAME/equipmanager:latest
```

### Deployment

1. Copy `docker-compose.deploy.yml` to your server
2. Create a `.env` file (see Environment Variables below)
3. Update the image name:
   ```yaml
   image: YOUR_DOCKERHUB_USERNAME/equipmanager:latest
   ```
4. Run:
   ```bash
   docker compose -f docker-compose.deploy.yml up -d
   ```

### First-time database setup
```bash
docker compose -f docker-compose.deploy.yml exec app npx drizzle-kit push
```

---

## Environment Variables

Create a `.env` file next to your `docker-compose.deploy.yml`:

```env
# Application
APP_PORT=5000

# Database credentials (change these in production!)
POSTGRES_USER=equipmanager
POSTGRES_PASSWORD=your_secure_password_here
POSTGRES_DB=equipmanager

# Optional: Expose database port (remove in production)
# DB_PORT=5432
```

---

## Quick Commands

```bash
# Start the stack
docker compose -f docker-compose.deploy.yml up -d

# View logs
docker compose -f docker-compose.deploy.yml logs -f

# Stop the stack
docker compose -f docker-compose.deploy.yml down

# Update to latest image
docker compose -f docker-compose.deploy.yml pull
docker compose -f docker-compose.deploy.yml up -d

# Backup database
docker compose -f docker-compose.deploy.yml exec db pg_dump -U equipmanager equipmanager > backup.sql

# Restore database
docker compose -f docker-compose.deploy.yml exec -T db psql -U equipmanager equipmanager < backup.sql
```

---

## Versioning

When using GitHub Actions, images are tagged automatically:
- `latest` - always points to the latest `main` branch build
- `v1.0.0` - when you create a release tag
- `main` - branch name tag

To deploy a specific version:
```yaml
image: ghcr.io/YOUR_USERNAME/YOUR_REPO:v1.0.0
```
