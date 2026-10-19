.PHONY: test check install run

install:
	npm ci --cache .npm-cache

test:
	npm test

check:
	npm run check

run:
	npm start
