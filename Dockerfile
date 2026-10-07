FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm run portable:check
ENV NODE_ENV=production
ENV PORT=8787
EXPOSE 8787
CMD ["npm","start"]
