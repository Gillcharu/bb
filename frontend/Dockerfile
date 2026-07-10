FROM node:20-alpine

WORKDIR /app

# Copy dependency files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy application files
COPY . .

EXPOSE 3000

# Start Vite dev server in host mode
CMD ["npm", "run", "dev"]
