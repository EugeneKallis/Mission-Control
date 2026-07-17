# Plan: Change energy-price scraper timer from 9 AM to 8 AM

## Context

User wants the daily energizect scrape to fire at 8:00 AM instead of 9:00 AM.

## Files to modify
- `deploy/mission-control-energy-price-scraper.timer` — Change `OnCalendar` from `09:00:00` to `08:00:00`, update the Description

## Steps
- [x] Determine current timer setting (9:00 AM)
- [ ] Change `OnCalendar=*-*-* 08:00:00` and Description text
- [ ] On the server: `systemctl daemon-reload && systemctl restart mission-control-energy-price-scraper.timer`
