# Docker daemon log rotation

`ops/docker-daemon.json` is the daemon config for production hosts. It must stay pure JSON —
`dockerd` will not parse comments.

## Install

```sh
cp ops/docker-daemon.json /etc/docker/daemon.json
systemctl restart docker
```

**Restart, not reload.** `systemctl reload docker` sends SIGHUP, and `log-opts` is not a
reloadable option. The daemon logs `Reloaded configuration` with no `log-opts` field and new
containers keep `LogConfig.Config={}`. Observed on 2026-11-13; reported upstream as
`docker/for-linux#771` for the same symptom.

## Then recreate the containers

A restart preserves each container's `HostConfig`, so running containers keep the old
(unlimited) log config. Recreate them:

```sh
cd /root/grandpos/deploy && docker compose -p deploy -f docker-compose-p1a.yml up -d --force-recreate
cd /root/grandpos/backend-landing-page && docker compose up -d --force-recreate --no-deps api
cd /root/grandpos/backend-landing-page && docker compose up -d --force-recreate --no-deps db
```

## Verify

```sh
for c in $(docker ps --format '{{.Names}}'); do
  printf '%-26s ' "$c"
  docker inspect "$c" --format '{{index .HostConfig.LogConfig.Config "max-size"}}/{{index .HostConfig.LogConfig.Config "max-file"}}'
done
# expect 10m/3 on every line
```

A fresh throwaway container is the cleanest check that the daemon itself is right:

```sh
docker run -d --name logprobe alpine sleep 20
docker inspect logprobe --format '{{.HostConfig.LogConfig.Config}}'   # map[max-file:3 max-size:10m]
docker rm -f logprobe
```

## Observed result (2026-11-13)

All four production containers report `10m/3`, all healthy, row counts unchanged
(orders 110, products 417, edge_ingest_log 338), volume `grandpos_pgdata` untouched.
