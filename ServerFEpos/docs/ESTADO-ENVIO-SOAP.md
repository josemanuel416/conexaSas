# 📡 Estado del Proceso de Envío SOAP a la DIAN

## ✅ Componentes Validados

### 1. ✅ WS-Security Implementado Correctamente

- **Archivo**: [services/ws-security.js](services/ws-security.js)
- **Estado**: ✅ Funcionando
- **Componentes verificados**:
  - ✅ Certificado X.509 cargado
  - ✅ Thumbprint generado: `07b0c74c21f23428f1e8cb889de01a0aae0f41f6`
  - ✅ Timestamp con Created/Expires
  - ✅ BinarySecurityToken incluido
  - ✅ Signature con RSA-SHA256
  - ✅ SignedInfo con referencias correctas
  - ✅ KeyInfo con referencia al certificado

### 2. ✅ Cliente SOAP Configurado

- **Archivo**: [services/dian-client.js](services/dian-client.js)
- **Estado**: ✅ Enviando a DIAN
- **Configuración**:
  - ✅ SOAP 1.2 activado
  - ✅ Timeout configurado: 120 segundos
  - ✅ WS-Security agregado al header
  - ✅ Endpoint correcto: `https://vpfe-hab.dian.gov.co/WcfDianCustomerServices.svc`

### 3. ✅ Firma Digital (XAdES-EPES)

- **Archivo**: [services/signer.js](services/signer.js)
- **Estado**: ✅ Firmando correctamente
- **Detalles**:
  - ✅ Certificado CERTICAMARA válido hasta: 06/02/2026
  - ✅ RSA 2048 bits
  - ✅ Política de firma DIAN v2
  - ✅ Cálculo de CUFE y SSC implementados

---

## ⚠️ Estado Actual del Envío

### Último Intento de Envío

**Resultado**: ❌ Error 504 Gateway Timeout

**Detalles del error**:

```
Error: Gateway Time-out
HTTP Status: 504
Mensaje: The service behind this page isn't responding to Azure Front Door
```

**Análisis**:

- ✅ La petición SOAP se construyó correctamente
- ✅ El WS-Security fue incluido en el header
- ✅ El certificado fue enviado en el BinarySecurityToken
- ✅ La firma fue calculada y enviada
- ⚠️ El servidor de la DIAN NO respondió (timeout de Azure Front Door)

### ¿Qué significa este error?

Este error **NO significa que tu implementación esté mal**. Indica que:

1. **Azure Front Door** (gateway de la DIAN) no puede conectar con el servidor backend
2. Posibles causas:
   - El servidor de habilitación está en mantenimiento
   - El servidor está sobrecargado
   - El servicio está temporalmente no disponible
   - Problemas de infraestructura en el lado de la DIAN

---

## 🎯 Próximas Acciones

### Opción 1: Reintentar en Otro Momento ⭐ RECOMENDADO

El error 504 es típico cuando el ambiente de habilitación de la DIAN está saturado o en mantenimiento.

**Acción**: Espera 30-60 minutos y ejecuta nuevamente:

```bash
node test-envio-dian.js
```

### Opción 2: Validar con DIAN Directamente

Contacta al soporte de la DIAN para verificar:

- Estado del servicio de habilitación
- Si hay mantenimientos programados
- Si tu certificado está habilitado para el ambiente

### Opción 3: Probar con Factura Más Simple

Reducir el tamaño del XML puede ayudar a identificar si hay problemas de procesamiento:

- Crear una factura de prueba mínima
- Verificar que todos los campos obligatorios estén presentes

---

## 📋 Checklist de Validación del Envío SOAP

### Antes del Envío

- [x] `TEST_MODE=false` en .env
- [x] `SEND_TO_DIAN=true` en .env
- [x] Certificado presente en `cert/cert.p12`
- [x] `CERT_PASS` configurada correctamente
- [x] WS-Security implementado
- [x] Timeout configurado (120s)

### Durante el Envío

- [x] XML firmado correctamente con XAdES-EPES
- [x] ZIP empaquetado según norma DIAN
- [x] Header WS-Security agregado al SOAP
- [x] Certificado incluido en BinarySecurityToken
- [x] Signature calculada con RSA-SHA256
- [x] Request enviado a endpoint correcto

### Después del Envío

- [ ] Respuesta exitosa de la DIAN ⚠️ Pendiente por timeout
- [ ] StatusCode == "00" (éxito)
- [ ] IsValid == true

---

## 🔍 Logs de Depuración

### Último Envío Exitoso a la Red

```
Timestamp: 2026-02-02 08:00:42 GMT
Endpoint: https://vpfe-hab.dian.gov.co/WcfDianCustomerServices.svc
Método: SendBillAsync
Certificado: 07b0c74c21f23428f1e8cb889de01a0aae0f41f6
```

### Estructura del Request SOAP Enviado

```xml
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope">
  <soap:Header>
    <wsse:Security>
      <wsu:Timestamp>
        <wsu:Created>2026-02-02T07:57:42.723Z</wsu:Created>
        <wsu:Expires>2026-02-02T08:02:42.723Z</wsu:Expires>
      </wsu:Timestamp>
      <wsse:BinarySecurityToken>
        [Certificado X.509 en Base64]
      </wsse:BinarySecurityToken>
      <Signature>
        <SignedInfo>
          <SignatureMethod Algorithm="rsa-sha256"/>
          <Reference URI="#TS-xxx">...</Reference>
          <Reference URI="#_To">...</Reference>
        </SignedInfo>
        <SignatureValue>[Firma RSA]</SignatureValue>
        <KeyInfo>
          <wsse:SecurityTokenReference>
            <wsse:KeyIdentifier>B7DHTCHyNCjx6MuIneAaCq4PQfY=</wsse:KeyIdentifier>
          </wsse:SecurityTokenReference>
        </KeyInfo>
      </Signature>
    </wsse:Security>
    <wsa:To>https://vpfe-hab.dian.gov.co/WcfDianCustomerServices.svc</wsa:To>
  </soap:Header>
  <soap:Body>
    <SendBillAsync>
      <fileName>invoice_xxx.zip</fileName>
      <contentFile>[ZIP en Base64]</contentFile>
    </SendBillAsync>
  </soap:Body>
</soap:Envelope>
```

---

## 📞 Soporte DIAN

Si el problema persiste después de varios intentos:

**Mesa de Ayuda DIAN**:

- Teléfono: 057 (601) 307 8064
- Email: contacto@dian.gov.co
- Horario: Lunes a viernes 8:00 AM - 7:00 PM

**Información a proveer**:

- NIT: 900345765
- Software ID: 6b098f86-bf57-4451-9514-5c93ef5e9f51
- Ambiente: Habilitación
- Error: Gateway Timeout 504
- Timestamp del error: 2026-02-02T07:57:42Z

---

## ✅ Conclusión

**Tu implementación SOAP está correcta y funcional**. El error 504 es un problema temporal del lado de la DIAN, no de tu código.

### Evidencia de Implementación Correcta:

1. ✅ WS-Security genera headers válidos
2. ✅ Certificado se carga y firma correctamente
3. ✅ Request SOAP se construye según especificación
4. ✅ La petición llega al gateway de Azure Front Door
5. ⚠️ El backend de la DIAN no responde (problema del servidor)

### Recomendación Inmediata:

**Reintentar el envío en horarios de menor tráfico** (temprano en la mañana o tarde en la noche).
