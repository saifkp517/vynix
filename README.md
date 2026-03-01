# Zentra – Setup & Deployment Guide
![alt text](https://www.notion.so/image/attachment%3Abeaac051-7e7c-4a35-be68-a570f8f0d50a%3Aimage.png?table=block&id=2236a4af-6be5-80b8-b899-de3b49c13213&spaceId=9ac34708-1a91-43c9-8446-c0ed190e48ed&width=1420&userId=&cache=v2)


This guide explains how to run the project in **development** and **production** environments.

---

# 🚀 Development Setup

## 1. Requirements

On Linux, you need:

* Node.js / Bun
* Redis
* PostgreSQL

Install Redis:

```bash
sudo apt update
sudo apt install redis-server -y
sudo systemctl enable redis
sudo systemctl start redis
```

Install PostgreSQL:

```bash
sudo apt install postgresql postgresql-contrib -y
sudo systemctl enable postgresql
sudo systemctl start postgresql
```

---

## 2. Environment Variables

Create a `.env` file in your project root:

```env
REDIS_HOST=127.0.0.1
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres
```

### Notes

* `REDIS_HOST` should point to your Redis server (default is localhost)
* `DATABASE_URL` follows format:

```
postgresql://USER:PASSWORD@HOST:PORT/DATABASE
```

---

## 3. Run Development Server

```bash
npm run dev
```

This starts:

* REST API server
* Socket server

---

# ⚙️ Production Setup

Production uses:

* PM2 (process manager)
* Nginx (reverse proxy)
* SSL via Let's Encrypt

---

## 1. Install Dependencies

```bash
sudo apt update
sudo apt install nginx redis-server postgresql -y
npm install -g pm2
```

---

## 2. Environment Variables

Ensure your `.env` is set correctly:

```env
REDIS_HOST=127.0.0.1
DATABASE_URL=postgresql://postgres:yourpassword@127.0.0.1:5432/postgres
```

Make sure your app loads env variables (e.g. using `dotenv`).

---

## 3. Run with PM2

Create `ecosystem.config.cjs`:

```js
module.exports = {
  apps: [
    {
      name: "rest-api",
      script: "bun",
      args: "run ./rest-api/index.ts",
      max_memory_restart: "200M"
    },
    {
      name: "socket-server",
      script: "bun",
      args: "run ./socket-server/index.ts",
      max_memory_restart: "200M"
    }
  ]
};
```

Start services:

```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```
---

## Run Client (Frontend)

The frontend is located in the `client` folder.

```bash
cd client
npm install
```

### Development

```bash
npm run dev
```

### Production (local)

```bash
npm run build
npm start
```

> Make sure the backend server is running for API and socket connections.

---

## 4. Nginx Configuration

Example config:

```nginx
server {
    server_name thryp.duckdns.org;

    location /socket.io/ {
        proxy_pass http://127.0.0.1:4000/socket.io/;
        proxy_http_version 1.1;

        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
        proxy_buffering off;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    listen 443 ssl;
    ssl_certificate /etc/letsencrypt/live/thryp.duckdns.org/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/thryp.duckdns.org/privkey.pem;
}

server {
    listen 80;
    server_name thryp.duckdns.org;

    return 301 https://$host$request_uri;
}
```

---

## 5. Enable Nginx Site

```bash
sudo mv nginx-conf /etc/nginx/sites-available/thryp
sudo ln -s /etc/nginx/sites-available/thryp /etc/nginx/sites-enabled/thryp
sudo rm /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx
```

---

## 6. SSL Certificate (Let's Encrypt)

Generate certificate:

```bash
sudo certbot certonly --nginx -d thryp.duckdns.org
```

Reload nginx:

```bash
sudo systemctl reload nginx
```

Test renewal:

```bash
sudo certbot renew --dry-run
```

---

## 7. DuckDNS Setup (Testing Domain)

`thryp.duckdns.org` is used as a **test domain**.

To use your own:

1. Create a DuckDNS domain
2. Point it to your VPS IP
3. Replace domain in nginx config
4. Regenerate SSL certificate

Check DNS:

```bash
ping yourdomain.duckdns.org
```

---

# 🧪 Troubleshooting

## Redis Errors (ESERVFAIL)

Ensure:

```env
REDIS_HOST=127.0.0.1
```

And Redis is running:

```bash
redis-cli ping
```

---

## Nginx 404

* Ensure config is enabled
* Remove default site
* Check proxy_pass paths

---

## Check Services

```bash
pm2 list
pm2 logs
sudo systemctl status nginx
```

---

# 🧠 Notes

* Use `127.0.0.1` instead of `localhost` for consistency
* Avoid watch mode in production (saves memory)
* Use swap on low RAM servers

---

# ✅ Summary

Development:

```bash
npm run dev
```

Production:

* PM2 for processes
* Nginx for routing
* Certbot for SSL

---

You now have a full setup for running the application in both development and production environments.
