# CLAUDE.md — Ensilados Santa Cruz (tesis + sistema)

Plataforma web de compras y cálculo de fletes para Ensilados Santa Cruz (San Ramón, Bolivia). Tesis de grado UDABOL 2026 (Jorge Luciano Ortubé Flores).

## Stack
React 18 + Vite + TS + Tailwind · Node/Express (MVC + services) · Supabase/PostgreSQL (modo memoria sin Supabase) · Google Maps + Haversine · JWT + TOTP · Docker.

## Comandos
- API: `cd backend && npm install && npm run dev` · pruebas: `npm test` (25, `node:test`)
- Web: `cd frontend && npm install && npm run dev` · `npm run build`
- Todo: `cp .env.example .env && docker compose up -d --build`

## Reglas de dominio (no romper)
- Flete = `viajes × (tarifa_base + km × precio_km) + Σ(ton × factor_flete)`; `viajes = ⌈peso/capacidad⌉`; Haversine ×1,25 de contingencia. Defaults: 350 Bs, 12 Bs/km, 30 TM, mín. 0,5 TM. Fuente única: `backend/src/models/fleteModel.js` (el frontend replica en `api.ts → cotizarLocal`; mantenerlos iguales).
- El servidor recalcula todo; nunca confiar en importes del cliente.
- Stock y estados solo vía RPC SQL (`crear_pedido`, `actualizar_estado_pedido`); no hay borrado de pedidos (Cancelado repone stock).
- Estados: Pendiente⇄En Camino → Entregado/Cancelado (finales).
- Sin secretos ni usuarios por defecto en el código; `.env` nunca se sube.

## Mapa
`backend/src/{routes,controllers,services,models,middleware,utils,config}` · `frontend/src/{api.ts,types.ts,components/}` · `database/schema.sql` · `docs/{ARQUITECTURA,API,GUIA-USUARIO}.md`

## Directrices
- Español académico para la tesis (APA 7); código y API en español para el dominio.
- Si cambia el código, actualizar `README.md`, `docs/API.md`, `docs/GUIA-USUARIO.md` y la tesis en el mismo cambio (HU01–HU09, Scrum 4 Sprints).
- Toda funcionalidad nueva lleva prueba en `backend/tests`.
