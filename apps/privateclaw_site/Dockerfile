FROM nginx:1.27-alpine

ENV PORT=8080

COPY . /usr/share/nginx/html/
RUN rm -rf /usr/share/nginx/html/nginx \
  /usr/share/nginx/html/Dockerfile \
  /usr/share/nginx/html/railway.toml
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template

EXPOSE 8080
