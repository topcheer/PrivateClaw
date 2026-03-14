FROM nginx:1.27-alpine

ENV PORT=8080

COPY index.html /usr/share/nginx/html/
COPY styles.css /usr/share/nginx/html/styles.css
COPY assets/ /usr/share/nginx/html/assets/
COPY chat/ /usr/share/nginx/html/chat/
COPY scripts/ /usr/share/nginx/html/scripts/
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template

EXPOSE 8080
