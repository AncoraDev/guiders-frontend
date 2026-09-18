# Accesos local

## Admin plataforma (`http://localhost:4201`)

| Campo | Valor |
|-------|--------|
| Email | `AdminGuiders@guiders.local` |
| Password | `Admin123!` |
| Rol | `superadmin` |
| Username KC | `sergigarcia` *(Keycloak no permitió renombrar; puedes entrar con el email)* |


## Console (`http://localhost:4200`)

| Campo | Valor |
|-------|--------|
| Email | `admin@rmotion.com` |
| Password | `Admin123!` |
| Rol | admin / comercial (Demo Company) |

`admin@guiders.local` **no existe** en Keycloak local. No uses el `superadmin`
de Admin en Console: las APIs de atención exigen `admin` / `commercial` /
`supervisor`. El staff Guiders entra en `:4201`.

## Keycloak admin (`http://localhost:8080`)

| Campo | Valor |
|-------|--------|
| Usuario | `admin` |
| Password | `admin123` |
