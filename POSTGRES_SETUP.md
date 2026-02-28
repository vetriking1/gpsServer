# PostgreSQL + PostGIS + TimescaleDB Setup Guide
## Ubuntu 24.04 LTS

### Step 1: Install PostgreSQL 16

```bash
# Add PostgreSQL repository
sudo apt update
sudo apt install -y postgresql-common
sudo /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh

# Install PostgreSQL 16
sudo apt update
sudo apt install -y postgresql-16 postgresql-contrib-16
```

### Step 2: Install PostGIS

```bash
# Install PostGIS extension
sudo apt install -y postgresql-16-postgis-3

# Verify installation
psql --version
```

### Step 3: Install TimescaleDB

```bash
# Add TimescaleDB repository
sudo apt install -y gnupg postgresql-common apt-transport-https lsb-release wget

# Add the repository
echo "deb https://packagecloud.io/timescale/timescaledb/ubuntu/ $(lsb_release -c -s) main" | sudo tee /etc/apt/sources.list.d/timescaledb.list

# Import GPG key
wget --quiet -O - https://packagecloud.io/timescale/timescaledb/gpgkey | sudo gpg --dearmor -o /etc/apt/trusted.gpg.d/timescaledb.gpg

# Install TimescaleDB
sudo apt update
sudo apt install -y timescaledb-2-postgresql-16

# Tune PostgreSQL for TimescaleDB
sudo timescaledb-tune --quiet --yes
```

### Step 4: Configure PostgreSQL

```bash
# Restart PostgreSQL
sudo systemctl restart postgresql

# Enable and check status
sudo systemctl enable postgresql
sudo systemctl status postgresql
```

### Step 5: Create Database and User

```bash
# Switch to postgres user
sudo -u postgres psql

# In PostgreSQL prompt, run:
```

```sql
-- Create database
CREATE DATABASE gps_tracker;

-- Create user with password
CREATE USER gps_user WITH PASSWORD 'arrov25@';

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE gps_tracker TO gps_user;

-- Connect to the database
\c gps_tracker

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Grant schema permissions
GRANT ALL ON SCHEMA public TO gps_user;

-- Exit
\q
```

### Step 6: Configure Remote Access (if needed)

```bash
# Edit PostgreSQL config
sudo nano /etc/postgresql/16/main/postgresql.conf
```

Find and change:
```
listen_addresses = 'localhost'
```
To:
```
listen_addresses = '*'
```

Edit pg_hba.conf:
```bash
sudo nano /etc/postgresql/16/main/pg_hba.conf
```

Add this line (adjust IP range as needed):
```
host    gps_tracker    gps_user    0.0.0.0/0    scram-sha-256
```

Restart PostgreSQL:
```bash
sudo systemctl restart postgresql
```

### Step 7: Configure Firewall

```bash
# Allow PostgreSQL port
sudo ufw allow 5432/tcp

# Check firewall status
sudo ufw status
```

### Step 8: Test Connection

```bash
# Test local connection
psql -U gps_user -d gps_tracker -h localhost

# Test remote connection (from your dev machine)
psql -U gps_user -d gps_tracker -h YOUR_SERVER_IP
```

### Step 9: Install Node.js PostgreSQL Driver

```bash
# In your project directory
npm install pg
```

### Verification Commands

```bash
# Check PostgreSQL version
psql -U postgres -c "SELECT version();"

# Check PostGIS version
psql -U postgres -d gps_tracker -c "SELECT PostGIS_version();"

# Check TimescaleDB version
psql -U postgres -d gps_tracker -c "SELECT extversion FROM pg_extension WHERE extname='timescaledb';"
```

### Security Best Practices

1. Use strong password for gps_user
2. Restrict pg_hba.conf to specific IPs only
3. Enable SSL connections (optional but recommended)
4. Regular backups using pg_dump
5. Keep PostgreSQL updated

### Backup Command

```bash
# Backup database
pg_dump -U gps_user -d gps_tracker -F c -f gps_tracker_backup.dump

# Restore database
pg_restore -U gps_user -d gps_tracker gps_tracker_backup.dump
```

---

## Next Steps

After installation, I'll update your server.js to use PostgreSQL instead of SQLite.
