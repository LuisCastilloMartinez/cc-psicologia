# 🧠 PsicoSoft — Sistema de Gestión Clínica (C&C Psicología)

![Estado: Activo](https://img.shields.io/badge/Estado-Activo-success)
![Versión: 1.0.0](https://img.shields.io/badge/Versi%C3%B3n-1.0.0-blue)
![Seguridad: LFPDPPP Cumplimiento](https://img.shields.io/badge/Seguridad-LFPDPPP_|_NOM--024-critical)

**PsicoSoft** es una plataforma integral diseñada exclusivamente para la clínica **C&C Psicología**. Permite administrar operaciones de consultorios, llevar expedientes clínicos electrónicos, gestionar agendas de citas médicas sin conflictos y resguardar los datos bajo estrictas normativas de seguridad mexicanas.

## 🌟 Características Principales

- **Gestión de Pacientes**: Expedientes electrónicos seguros, almacenamiento de datos demográficos clínicos e historial.
- **Administración de Consultorios**: Control de múltiples físicos consultorios, asignación y disponibilidad.
- **Agenda Inteligente**: Sistema de calendarización de citas médicas con módulo automático de *detección de conflictos* (evita doble reservación de un consultorio o psicólogo).
- **Seguridad y Privacidad**: Arquitectura de base de datos cifrada y enrutamiento seguro que garantiza el cumplimiento total de la ley **LFPDPPP** y **NOM-024-SSA3-2012** (Sistemas de Información de Registro Electrónico para la Salud).
- **Interfaz Moderna**: Panel interactivo, responsivo y de alto rendimiento.

## 🛠️ Tecnologías Utilizadas

- **Frontend**: HTML5, Vanilla CSS3 (Módulos modernos, Flex/Grid UI), Javascript (Vanilla ES6+).
- **Backend / API**: Node.js, Express.js.
- **Base de Datos**: SQLite3 (para portabilidad local, rapidez y fácil gestión de copias de seguridad estables y seguras).
- **Seguridad**: Validación estricta de variables de entorno y prevención por CORS/Sanitización (Server validation).

## 🚀 Instalación y Despliegue Local

### Requisitos Previos
- [Node.js](https://nodejs.org/es/) (v16.x o superior recomendado).
- Git.

### Paso a paso

1. **Clonar el repositorio**
   ```bash
   git clone https://github.com/LuisCastilloMartinez/cc-psicologia.git
   cd cc-psicologia
   ```

2. **Instalar dependencias del servidor**
   ```bash
   cd server
   npm install
   ```

3. **Configurar Variables de Entorno**
   - Asegúrate de contar con el archivo `.env` en el directorio `server/`. Contacta al administrador para las claves de cifrado o configuración si aún no cuentas con él.

4. **Iniciar el Servidor Local**
   ```bash
   npm start
   ```
   > El servidor estará escuchando por defecto de forma segura para las consultas de la aplicación.

5. **Abrir la Aplicación**
   - Abre `index.html` en tu navegador moderno de preferencia (Chrome, Edge, Firefox) o utiliza una extensión temporal como Live Server si deseas simular ambiente productivo al frontend.

## 📖 Documentación para el Usuario

Hemos elaborado un manual de usuario detallado explicando las funciones básicas:
👉 [Ver Manual de Usuario](./MANUAL_DE_USUARIO.md)

---

**© 2026 C&C Psicología.** Todos los derechos reservados. El código y modelo de datos está sujeto a políticas de privacidad y derechos de propiedad intelectual de uso privado.
