# Deploying on AWS

The app is a single Docker image (Node API + built React app) and needs a
PostgreSQL 14+ database with the `btree_gist` extension. That extension is
available on RDS and in the official Postgres image. Migrations run when the
app starts. In demo mode, demo data loads automatically into an empty database.

Two ways to run it:

| | A. EC2 + Docker Compose | B. Elastic Beanstalk + RDS |
|---|---|---|
| Good for | The review link | Something closer to production |
| Database | Postgres container on the same box | Managed RDS |
| Cost | One t3.small (about $15/month) | EB instance + db.t4g.micro |
| Setup time | About 10 minutes | About 30 minutes |

---

## A. EC2 with Docker Compose (recommended for the submission)

1. **Launch an instance.** EC2 → Launch instance:
   - AMI: Amazon Linux 2023
   - Type: `t3.small` (a t3.micro also works, but builds are slow)
   - Security group: allow SSH (22) from your IP, and HTTP (80) from anywhere
   - Storage: 16 GB gp3

2. **Copy the project up.**
   ```bash
   scp -i key.pem grit-interviews.zip ec2-user@<public-ip>:~
   ssh -i key.pem ec2-user@<public-ip>
   sudo dnf install -y unzip && unzip grit-interviews.zip && cd grit-interviews
   ```

3. **Run the setup script.** It installs Docker, writes a `.env` with random
   secrets and starts the stack.
   ```bash
   bash deploy/ec2-setup.sh
   ```
   Open `http://<public-ip>/`. That is your live link.

4. **(Optional) A domain with HTTPS.** Point an A record at an Elastic IP
   attached to the instance. Then either put an Application Load Balancer
   with an ACM certificate in front of it, or put Caddy on the box:
   ```bash
   # in docker-compose.yml, change the app port to "8080:8080", then:
   sudo dnf install -y caddy   # or run the caddy container
   echo "interviews.yourdomain.com { reverse_proxy localhost:8080 }" | sudo tee /etc/caddy/Caddyfile
   sudo systemctl enable --now caddy
   ```
   Set `COOKIE_SECURE=true` in `.env` and run `sudo docker compose up -d`.

**Day-to-day**
```bash
sudo docker compose logs -f app        # logs
sudo docker compose up -d --build      # redeploy after changes
sudo docker compose exec app node scripts/seed.js   # reset demo data
```

---

## B. Elastic Beanstalk with RDS

1. **Create the database.** RDS → Create database → PostgreSQL 16,
   `db.t4g.micro`, database name `grit`. Put it in the same VPC that Beanstalk
   will use, and allow inbound 5432 from the Beanstalk instances' security
   group.

2. **Create the environment.** Elastic Beanstalk → Create application →
   Platform *Docker* (Amazon Linux 2023). Upload a bundle that **leaves out
   `docker-compose.yml`**, so Beanstalk builds the `Dockerfile` instead of
   starting its own Postgres:
   ```bash
   zip -r ../grit-eb.zip . -x "docker-compose.yml" "*/node_modules/*" "client/dist/*" ".env"
   ```

3. **Environment properties** (Configuration → Updates, monitoring, and logging):
   ```
   DATABASE_URL   = postgres://<user>:<pass>@<rds-endpoint>:5432/grit
   DATABASE_SSL   = true
   SESSION_SECRET = <openssl rand -hex 32>
   DEMO_MODE      = true
   ```
   Beanstalk's nginx forwards port 80 to the container's exposed port 8080.

4. **Health check.** Set the load balancer health check path to `/healthz`.

5. **HTTPS.** Add a listener on 443 with an ACM certificate on the environment's
   load balancer, then set `COOKIE_SECURE=true`.

The same image also runs on ECS Fargate behind an ALB with the same
environment variables. Push it to ECR with
`docker build -t grit-interviews . && docker tag ... && docker push ...`.

---

## Environment variables

| Name | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string |
| `DATABASE_SSL` | for RDS | `true` to connect over TLS |
| `SESSION_SECRET` | yes in production | Signs session cookies |
| `DEMO_MODE` | no | `true` (default) shows the role switcher and allows early outcome recording. Set `false` behind real SSO |
| `COOKIE_SECURE` | no | `true` once served over HTTPS |
| `LICENSE_KEY` | no | Issued by the author. Without it the app runs as a watermarked evaluation build |
| `PORT` | no | Defaults to 8080 |
