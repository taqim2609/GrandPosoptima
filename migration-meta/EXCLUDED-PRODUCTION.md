# GrandPos project workspace

Created: 20261118-041731

Production paths intentionally left untouched:
- /root/grandpos/backend-landing-page/ (grandpos-mcp.service working directory)
- /root/grandpos/deploy/data/ (grandpos_web_app bind mount)
- /srv/pgdata/grandpos/ (pg-grandpos data)
- active Docker containers, systemd units, and secrets

Excluded from workspace copy:
- .env and .env.*
- live data/ and database dumps
- node_modules, venv, caches, generated dist/ and graphify-out/
- .git metadata
