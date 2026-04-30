# Seed Accounts

Demo accounts available in the development environment. Password for all: `password123`.

| Email | Role | Expected Landing Page |
|---|---|---|
| admin@washbuddy.com | PLATFORM_SUPER_ADMIN | /admin |
| demo.fleet@washbuddy.com | FLEET_ADMIN | /fleet |
| demo.driver@washbuddy.com | DRIVER | /search |
| driver1@example.com | DRIVER | /search |
| owner@cleanbus-nyc.com | PROVIDER_ADMIN | /provider |
| staff@cleanbus-nyc.com | PROVIDER_STAFF | /provider |

## Notes

- The demo accounts are seeded by the dev seed script. If accounts are missing or behaving incorrectly, re-run the seed.
- These accounts exist for development and testing only. Production uses real auth with no demo credentials.
- Roles correspond to the platform's user role enum. New roles get added here as they're introduced.
