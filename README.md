# Ensilados Santa Cruz - CRM & Logística Agrícola

Sistema inteligente y automatizado para la cotización de fletes y la venta de ensilados (Silo de Maíz, Soya, Sorgo) con geolocalización en tiempo real y resiliencia offline para productores agropecuarios en el departamento de Santa Cruz, Bolivia.

El proyecto está diseñado bajo una arquitectura limpia y modular con un Frontend interactivo y moderno (React + TypeScript + Tailwind) y un Backend robusto (Node.js + Express en arquitectura MVC), con soporte para persistencia local offline (LocalStorage) y nube (Supabase).

---

## Stack Tecnológico

- **Frontend:** React, TypeScript, Tailwind CSS, Recharts (gráficas), Lucide Icons, html2canvas / purifiy-css (reportes PDF).
- **Backend:** Node.js, Express (Arquitectura Modelo-Vista-Controlador).
- **Base de Datos:** PostgreSQL / Supabase.
- **Autenticación:** JWT + Doble Factor (2FA / TOTP) compatible con Google Authenticator/Authy.
- **Logística:** API de Google Maps con cálculo por Haversine de contingencia.
- **Empaquetado:** Docker & Docker Compose.

---

## Ejecución con Docker (Recomendado para Pruebas)

El proyecto incluye contenedores Docker configurados tanto para el backend como para el frontend. Esto permite iniciar todo el sistema con un solo comando sin necesidad de configurar dependencias locales.

### Requisitos previos:
- Tener instalado [Docker](https://www.docker.com/) y [Docker Compose](https://docs.docker.com/compose/).

### Pasos para iniciar:

1. Clona o ubícate en la carpeta raíz del proyecto.
2. Ejecuta el siguiente comando para compilar e iniciar los contenedores:
   ```bash
   docker-compose up --build
   ```
3. Una vez finalizada la construcción, el sistema estará disponible en los siguientes puertos:
   - **Frontend (Web):** [http://localhost:3000](http://localhost:3000)
   - **Backend (API):** [http://localhost:3001](http://localhost:3001)

### Detener la aplicación:
```bash
docker-compose down
```

---

## Desarrollo Local (Sin Docker)

Si prefieres ejecutar los servicios individualmente en tu máquina local:

### 1. Iniciar el Backend
1. Ve al directorio del backend:
   ```bash
   cd backend
   ```
2. Instala las dependencias:
   ```bash
   npm install
   ```
3. (Opcional) Crea un archivo `.env` basado en `.env.example` y añade tu clave de Google Maps API para habilitar fletes reales de carretera.
4. Inicia el servidor de desarrollo:
   ```bash
   npm run dev
   ```
   *El backend correrá en `http://localhost:3001`.*

### 2. Iniciar el Frontend
1. Ve al directorio del frontend:
   ```bash
   cd ../frontend
   ```
2. Instala las dependencias:
   ```bash
   npm install
   ```
3. Inicia el servidor de desarrollo:
   ```bash
   npm run dev
   ```
   *El frontend correrá en `http://localhost:3000`.*

---

## Credenciales de Acceso Demo

El sistema viene preconfigurado con cuentas de prueba para evaluar los roles administrativos del CRM (incluso si está offline):

- **Superadmin:**
  - **Usuario:** `superadmin@ensilados.com`
  - **Contraseña:** `superadmin123`
- **Admin:**
  - **Usuario:** `admin@ensilados.com`
  - **Contraseña:** `admin123`

---

## Base de Datos

El script SQL completo para montar la base de datos en Supabase o cualquier PostgreSQL se encuentra en:
- `database/schema.sql`

Este script crea las tablas de productos (con semillas), perfiles de usuario, pedidos, triggers para cálculo automático de márgenes financieros y códigos secuenciales únicos de orden.
