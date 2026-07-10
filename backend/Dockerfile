FROM node:20-alpine

WORKDIR /app

# Copy dependency files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy database schema and generate Prisma client
COPY prisma ./prisma
RUN npx prisma generate

# Copy application files
COPY . .

EXPOSE 4000

# Start server in development mode
CMD ["npm", "run", "dev"]
