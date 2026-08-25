# Mission Control

A server-hosted control panel for homelab infrastructure: media automation, scheduled
tasks, monitoring dashboards, and log surfaces.

## Language

### Log surfaces

**Docker Logs**:
The page that shows container logs merged across all configured Dozzle endpoints,
with results separated by instance.
_Avoid_: Container Logs, Dozzle page, Containers

**Log Viewer**:
The page that shows service logs read from the systemd journal.
_Avoid_: Docker Logs, logs page (ambiguous — name the surface)

### Docker Logs

**Dozzle Endpoint**:
A configured Dozzle instance whose containers appear in Docker Logs. Identified by a
human name and a URL.
_Avoid_: agent, remote host, server

**Instance**:
The grouping label for containers in Docker Logs; every container belongs to exactly
one Dozzle Endpoint's instance.
_Avoid_: host (reserved for Dozzle's own host concept), machine

**Backfill**:
The recent log lines loaded before a container's live tail begins; Docker Logs offers
100, 300, or 1,000 lines.
_Avoid_: history, download, export, time window
