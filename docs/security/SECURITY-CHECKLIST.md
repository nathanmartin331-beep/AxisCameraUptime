# Security Checklist - Axis Camera Uptime

**Last Updated**: 2025-11-11
**Security Score**: 62/100

## 🚨 CRITICAL - Do Before Deployment

- [ ] **REMOVE or RESTRICT auto-login endpoint** (`/api/auth/auto-login`)
  - File: `server/authRoutes.ts` lines 63-94
  - This bypasses all authentication!

- [ ] **CHANGE default credentials**
  - Current: `admin@local / admin123`
  - File: `server/defaultUser.ts`
  - Force password change on first login

- [ ] **GENERATE strong SESSION_SECRET**
  - Current: `camera-uptime-secret-key-change-in-production`
  - Generate: `openssl rand -base64 32`
  - Update `.env` file

- [ ] **ADD .env to .gitignore**
  ```bash
  echo ".env" >> .gitignore
  ```

- [ ] **INSTALL security middleware**
  ```bash
  npm install helmet express-rate-limit csurf
  ```

- [ ] **CONFIGURE helmet** in `server/index.ts`:
  ```javascript
  import helmet from 'helmet';
  app.use(helmet());
  ```

## 🔴 HIGH PRIORITY - Week 1

- [ ] **Implement CSRF protection**
  ```bash
  npm install csurf
  ```

- [ ] **Add rate limiting to auth endpoints**
  ```javascript
  import rateLimit from 'express-rate-limit';

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 attempts
    message: 'Too many login attempts'
  });

  app.use('/api/auth/login', authLimiter);
  ```

- [ ] **Enhance password requirements**
  - Minimum 12 characters
  - Mix of uppercase, lowercase, numbers, symbols
  - Reject common passwords

- [ ] **Sanitize error messages**
  - Return generic errors to client
  - Log details server-side only

- [ ] **Remove sensitive logging**
  - Clean up console.log statements
  - Sanitize user objects before logging

## 🟠 MEDIUM PRIORITY - Week 2-3

- [ ] **Update vulnerable dependencies**
  ```bash
  npm audit fix
  npm update drizzle-kit
  ```

- [ ] **Add request size limits**
  ```javascript
  app.use(express.json({ limit: '10mb' }));
  ```

- [ ] **Enhance cookie security**
  ```javascript
  cookie: {
    maxAge: 30 * 24 * 60 * 60 * 1000,
    httpOnly: true,
    secure: true, // Always require HTTPS
    sameSite: 'strict', // Strict CSRF protection
    domain: 'yourdomain.com'
  }
  ```

- [ ] **Add input validation schemas**
  - Use Zod for all req.body inputs
  - Validate req.params and req.query

- [ ] **Migrate to Redis sessions**
  ```bash
  npm install connect-redis ioredis
  ```

- [ ] **Enforce HTTPS**
  - Use reverse proxy (nginx)
  - Configure SSL certificates
  - Add HSTS headers

## 🟢 LONG-TERM - Month 1+

- [ ] **Implement MFA (Multi-Factor Auth)**
- [ ] **Add security audit logging**
- [ ] **Set up automated scanning**
  - Snyk
  - Dependabot
  - GitHub Advanced Security

- [ ] **Create incident response plan**
- [ ] **Perform penetration testing**
- [ ] **Add security monitoring (SIEM)**
- [ ] **Implement WAF**
- [ ] **Add API documentation (Swagger)**

## 📦 Required NPM Packages

```bash
# Install all security packages
npm install \
  helmet \
  express-rate-limit \
  csurf \
  express-validator \
  connect-redis \
  ioredis \
  winston \
  express-winston
```

## 🔍 Quick Test Commands

```bash
# Check for hardcoded secrets
grep -r "password\|secret\|key" server/ --include="*.ts" | grep -v node_modules

# Verify dependencies
npm audit

# Check for .env in git
git ls-files | grep .env

# Test authentication
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@local","password":"admin123"}'

# Test auto-login (should be disabled!)
curl -X POST http://localhost:5000/api/auth/auto-login
```

## 📊 Security Score Targets

| Phase | Target Score | Timeline |
|-------|--------------|----------|
| Current | 62/100 | - |
| Phase 1 | 75/100 | 1 week |
| Phase 2 | 85/100 | 2 weeks |
| Phase 3 | 90/100 | 1 month |
| Production Ready | 95/100 | 2 months |

## 🚦 Deployment Readiness

### Development ✅
- Current configuration acceptable
- Keep detailed logging for debugging

### Staging ⚠️
- Must complete all CRITICAL items
- Must complete HIGH priority items
- Enable HTTPS

### Production ❌ BLOCKED
**DO NOT DEPLOY until:**
- All CRITICAL items completed
- All HIGH priority items completed
- Security audit performed
- Penetration testing completed
- Incident response plan in place

## 📞 Security Contacts

- **Security Issues**: Report immediately to security team
- **Vulnerability Disclosure**: Follow responsible disclosure
- **Emergency Response**: Activate incident response plan

---

**Remember**: Security is not a one-time task. Regular audits and updates are essential.

**Next Review**: 2025-12-11
