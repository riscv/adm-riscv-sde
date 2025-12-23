FROM node:20-alpine AS build
WORKDIR /app
ARG VITE_YAML_URL=""
ENV VITE_YAML_URL=${VITE_YAML_URL}
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 5038
CMD ["nginx", "-g", "daemon off;"]
