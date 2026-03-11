# PlantPouch - Docker Deployment Guide

This guide covers two deployment options: GitHub Container Registry (automatic) and Docker Hub (manual).

---

## Option 1: GitHub Container Registry (Automatic)

The included GitHub Actions workflow automatically builds and pushes images when you push to `main`, push to `testing`, or create a release.

### Setup

1. **Push this repo to GitHub**
2. **Enable GitHub Packages** (usually enabled by default)
3. **Push to `main` or `testing`** - the matching image tag will build automatically

### Deployment

1. Copy `docker-compose.deploy.yml` to your server
2. Create a `.env` file with `./script/init-env.sh`
3. Run:
   ```bash
   chmod +x script/init-env.sh script/reset-db-password.sh
   ./script/init-env.sh
   docker compose -f docker-compose.deploy.yml up -d
   ```

The database tables are created automatically when the container starts - no manual migration needed!

---

## Option 2: Docker Hub (Manual)

### One-time Setup

1. Create a Docker Hub account at https://hub.docker.com
2. Create a repository called `plantpouch`

### Build and Push

```bash
# Log in to Docker Hub
docker login

# Build the image
docker build -t YOUR_DOCKERHUB_USERNAME/plantpouch:latest .

# Push to Docker Hub
docker push YOUR_DOCKERHUB_USERNAME/plantpouch:latest
```

### Deployment

1. Copy `docker-compose.deploy.yml` to your server
2. Create a `.env` file with `./script/init-env.sh`
3. Update the image name:
   ```yaml
   image: YOUR_DOCKERHUB_USERNAME/plantpouch:latest
   ```
4. Run:
   ```bash
   chmod +x script/init-env.sh script/reset-db-password.sh
   ./script/init-env.sh
   docker compose -f docker-compose.deploy.yml up -d
   ```

The database tables are created automatically when the container starts - no manual migration needed!

---

## Environment Variables

Create a `.env` file next to your `docker-compose.deploy.yml`:

```env
APP_PORT=5000
POSTGRES_USER=plantpouch
POSTGRES_PASSWORD=replace_me_with_a_long_random_password
POSTGRES_DB=plantpouch
```

The included helper creates this file for you:

```bash
./script/init-env.sh
```

To rotate the database password later without rebuilding the stack:

```bash
./script/reset-db-password.sh
```

That script updates Postgres, rewrites `.env`, and restarts the app with the new password.

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
/bin/sh -ac '. ./.env && docker compose --env-file .env -f docker-compose.deploy.yml exec db pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > backup.sql

# Restore database
/bin/sh -ac '. ./.env && docker compose --env-file .env -f docker-compose.deploy.yml exec -T db psql -U "$POSTGRES_USER" "$POSTGRES_DB"' < backup.sql
```

---

## Versioning

When using GitHub Actions, images are tagged automatically:
- `latest` - always points to the latest `main` branch build
- `testing` - points to the latest `testing` branch build
- `v1.0.0` - when you create a release tag
- `main` - branch name tag

To deploy a specific version:
```yaml
image: ghcr.io/redknoff55/plantpouch:v1.0.0
```

For a test stack that tracks the `testing` branch image, use [docker-compose.testing.yml](/home/rednoff55/code/PlantPouch/docker-compose.testing.yml).
