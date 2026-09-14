.PHONY: run test screenshots demo assets container push wiki

run:
	./run.sh

test:
	npm test

screenshots:
	npm run screenshots

demo:
	npm run demo

assets:
	npm run assets

container:
	docker compose up --build -d

push:
	./scripts/push-github.sh

wiki:
	./scripts/push-wiki.sh
