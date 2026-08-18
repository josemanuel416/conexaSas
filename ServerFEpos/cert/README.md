# 📁 Carpeta de Certificados

## ⚠️ IMPORTANTE

Esta carpeta debe contener tu **certificado digital DIAN** en formato PKCS#12 (.p12 o .pfx).

## 📋 Requisitos del Certificado

- **Formato**: `.p12` o `.pfx`
- **Nombre del archivo**: `cert.p12`
- **Ubicación**: Exactamente en esta carpeta (`cert/cert.p12`)
- **Emisor**: Debe ser emitido por la DIAN de Colombia
- **Estado**: Debe estar vigente

## 🔧 Configuración

1. **Coloca tu certificado aquí**:
   ```
   cert/cert.p12
   ```

2. **Configura la contraseña en `.env`**:
   ```env
   CERT_PASS=tu_contraseña_real_aqui
   ```

3. **Desactiva el modo de prueba en `.env`**:
   ```env
   TEST_MODE=false
   ```

## 🧪 Modo de Prueba

### Sin Certificado (Simulación Completa)
```env
TEST_MODE=true
SEND_TO_DIAN=false  # No importa, TEST_MODE tiene prioridad
```
En este modo:
- ✅ El servidor funciona sin certificado
- ✅ Valida que el XML sea válido
- ✅ Simula la firma digital
- ✅ Simula la respuesta de DIAN

### Con Certificado (Firma Real, Sin Envío)
```env
TEST_MODE=false
SEND_TO_DIAN=false  # ← Mantener en false para pruebas
```
En este modo:
- ✅ Usa el certificado real para firmar
- ✅ Genera firma XMLDSig válida
- ✅ Crea ZIP correcto
- ⚠️ **Simula** la respuesta de DIAN (no envía)
- 💡 **Ideal para validar certificado sin riesgo**

### Producción Real
```env
TEST_MODE=false
SEND_TO_DIAN=true  # ← Activar solo en producción
```
En este modo:
- ✅ Usa certificado real
- ✅ Firma el XML
- ✅ Envía a DIAN real
- ⚠️ **CUIDADO**: Esto envía facturas reales

## 🔐 Seguridad

**NUNCA subas tu certificado a Git o repositorios públicos**

El archivo `.gitignore` ya está configurado para ignorar:
- `cert/*.p12`
- `cert/*.pfx`
- `cert/*.pem`
- `cert/*.key`

## 📝 Notas

- El certificado es personal e intransferible
- Guarda una copia de seguridad en un lugar seguro
- La contraseña debe ser fuerte y única
- Renueva el certificado antes de que expire

## 🆘 Problemas Comunes

### Error: "Certificado no encontrado"
- ✅ Verifica que el archivo se llame exactamente `cert.p12`
- ✅ Verifica que esté en la carpeta `cert/`
- ✅ O activa `TEST_MODE=true` para probar sin certificado

### Error: "Contraseña incorrecta"
- ✅ Verifica `CERT_PASS` en el archivo `.env`
- ✅ Asegúrate de no tener espacios extras
- ✅ Verifica que sea la contraseña correcta del .p12

### Error: "No se encontró certificado o clave privada"
- ✅ El archivo .p12 puede estar corrupto
- ✅ Solicita un nuevo certificado a la DIAN
- ✅ Verifica que sea un certificado válido PKCS#12

---

**¿Necesitas un certificado de prueba de DIAN?**

Visita: https://www.dian.gov.co/fizcalizacioncontrol/herramienconsulta/FacturaElectronica/
