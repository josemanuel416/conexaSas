# Servidor de Facturación Electrónica - DIAN Colombia

Servidor Node.js para procesar y enviar facturas electrónicas a la DIAN de Colombia.

## 🚀 Características

- ✅ Firma digital de facturas XML con certificado PKCS#12
- ✅ Empaquetado en formato ZIP según normativa DIAN
- ✅ Envío mediante SOAP a servicios DIAN
- ✅ Registro de trazabilidad en logs
- ✅ Validación de respuestas DIAN

## 📋 Requisitos Previos

- Node.js >= 16.x
- Certificado digital DIAN en formato .p12
- Credenciales de acceso a servicios DIAN

## 🔧 Instalación

1. **Clonar o descargar el proyecto**

2. **Instalar dependencias**
```bash
npm install
```

3. **Configurar variables de entorno**

Copiar el archivo de ejemplo y configurar:
```bash
copy .env.example .env
```

Editar `.env` con tus datos:
```env
PORT=3000
TEST_MODE=false         # false = usa certificado real
SEND_TO_DIAN=false      # false = NO envía a DIAN (pruebas seguras)
CERT_PASS=tu_contraseña_del_certificado
DIAN_ENV=habilitacion
```

**Importante**: Mantén `SEND_TO_DIAN=false` mientras pruebas. Así podrás validar la firma con tu certificado real sin enviar a DIAN.

4. **Colocar certificado digital**

Copiar tu archivo `.p12` a la carpeta `cert/`:
```
cert/cert.p12
```

## ▶️ Uso

### Iniciar servidor

**Modo desarrollo** (con auto-reload):
```bash
npm run dev
```

**Modo producción**:
```bash
npm start
```

El servidor estará disponible en `http://localhost:3000`

### Enviar factura

**Endpoint**: `POST /factura`

**Headers**:
```
Content-Type: application/xml
```

**Body**: XML de la factura electrónica según estándar UBL 2.1

**Ejemplo con curl**:
```bash
curl -X POST http://localhost:3000/factura \
  -H "Content-Type: application/xml" \
  -d @factura.xml
```

**Respuesta exitosa**:
```json
{
  "aprobada": true,
  "codigo": "00",
  "mensaje": "Procesamiento exitoso",
  "archivo_respuesta": "1704398765432_response.xml"
}
```

## 📁 Estructura del Proyecto

```
ServerFEpos/
├── server.js              # Servidor Express principal
├── package.json           # Dependencias del proyecto
├── .env                   # Variables de entorno (no versionado)
├── .env.example           # Plantilla de variables
├── cert/                  # Certificados digitales
│   └── cert.p12          # Certificado DIAN (no versionado)
├── logs/                  # Logs de transacciones
│   ├── *_input.xml       # XML original recibido
│   ├── *_signed.xml      # XML firmado digitalmente
│   └── *_response.xml    # Respuesta de DIAN
└── services/             # Servicios modulares
    ├── signer.js         # Firma digital XMLDSig
    ├── packager.js       # Empaquetado ZIP
    └── dian-client.js    # Cliente SOAP DIAN
```

## 🔐 Seguridad

- **NUNCA** versionar archivos `.p12` o `.env` en Git
- Los certificados deben guardarse en `cert/` (carpeta ignorada por Git)
- La contraseña del certificado debe estar en `.env`
- Los logs pueden contener información sensible, revisar `.gitignore`

## 🛠️ Desarrollo

### Variables de entorno

| Variable | Descripción | Por defecto |
|----------|-------------|-------------|
| `PORT` | Puerto del servidor | `3000` |
| `TEST_MODE` | Modo de simulación completa (sin certificado) | `false` |
| `SEND_TO_DIAN` | Enviar a DIAN real (false = simula respuesta) | `false` |
| `CERT_PASS` | Contraseña del certificado .p12 | - |
| `DIAN_ENV` | Ambiente DIAN (habilitacion/produccion) | `habilitacion` |

### Servicios DIAN

- **Habilitación**: `https://vpfe-hab.dian.gov.co/WcfDianCustomerServices.svc?wsdl`
- **Producción**: `https://vpfe.dian.gov.co/WcfDianCustomerServices.svc?wsdl`

## 📝 Logs

Cada transacción genera 3 archivos en `logs/`:
- `{timestamp}_input.xml` - XML original
- `{timestamp}_signed.xml` - XML firmado
- `{timestamp}_response.xml` - Respuesta DIAN

## ⚠️ Notas Importantes

1. **Firma XMLDSig**: El código implementa firma según estándar XMLDSig con SHA-256 y RSA
2. **Formato UBL**: Las facturas deben cumplir con UBL 2.1
3. **Validación DIAN**: Código `00` indica aprobación exitosa
4. **Certificado**: Debe ser emitido por la DIAN y estar vigente

## 🐛 Solución de Problemas

### Error: "Certificado no encontrado"
- Verificar que `cert/cert.p12` existe
- Revisar la ruta en `signer.js`

### Error: "Contraseña incorrecta"
- Verificar `CERT_PASS` en `.env`
- Probar contraseña del certificado

### Error SOAP con DIAN
- Verificar conectividad con servicios DIAN
- Confirmar que estás usando el ambiente correcto (habilitación/producción)
- Revisar formato del XML enviado

## 📄 Licencia

ISC

## 👥 Soporte

Para problemas o consultas, crear un issue en el repositorio.
