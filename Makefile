.PHONY: up down logs test backend frontend fmt

up:        ## Start the full stack
	docker compose -f infra/docker-compose.yml up --build

down:      ## Stop and remove containers
	docker compose -f infra/docker-compose.yml down

logs:      ## Tail logs
	docker compose -f infra/docker-compose.yml logs -f

test:      ## Run backend tests
	cd backend && python -m pytest -q

backend:   ## Run API locally (mock mode, no docker)
	cd backend && uvicorn app.main:app --reload

frontend:  ## Run web locally
	cd frontend && npm run dev
