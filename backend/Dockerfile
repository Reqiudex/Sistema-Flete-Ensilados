# Build stage for node app
FROM node:18-alpine

# Set working directory
WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Install dependencies (only production dependencies for smaller image size)
RUN npm install --omit=dev

# Copy the rest of the application code
COPY . .

# Expose port
EXPOSE 3001

# Command to run the application
CMD ["npm", "start"]
