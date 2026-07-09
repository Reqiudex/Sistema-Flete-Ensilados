# Stage 1: Build the React application
FROM node:18-alpine AS build

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm install

COPY . .

RUN npm run build

# Stage 2: Serve the React application using Nginx
FROM nginx:1.25-alpine

# Copy built assets from build stage to nginx html directory
COPY --from=build /usr/src/app/dist /usr/share/nginx/html

# Copy custom Nginx configuration if needed (simple fallback for SPA routes)
# We can use the default Nginx config since the app uses state-based routing.
# But let's create a minimal config just in case they decide to use react-router in the future.
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
