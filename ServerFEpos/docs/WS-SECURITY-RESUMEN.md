# 🔐 Autenticación WS-Security - Resumen Ejecutivo

## ✅ Implementación Completa

La autenticación WS-Security con certificado X.509 ha sido **implementada exitosamente** en el sistema.

---

## 📊 Arquitectura del Sistema

```
┌─────────────────────────────────────────────────────────────────┐
│                    CLIENTE (Tu Sistema)                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. Factura XML                                                 │
│     ↓                                                           │
│  2. Firma XAdES-EPES (signer.js)                               │
│     ├─ Calcula CUFE (SHA-384)                                  │
│     ├─ Calcula SSC (SHA-384)                                   │
│     └─ Firma XML con certificado                               │
│     ↓                                                           │
│  3. Empaqueta en ZIP (packager.js)                             │
│     ↓                                                           │
│  4. WS-Security (ws-security.js) ← NUEVA IMPLEMENTACIÓN        │
│     ├─ Carga certificado X.509                                 │
│     ├─ Genera Timestamp (Created + Expires)                    │
│     ├─ Calcula Digests SHA-256 (Timestamp + To)                │
│     ├─ Firma con RSA-SHA256 usando clave privada               │
│     └─ Construye Security Header                               │
│     ↓                                                           │
│  5. Mensaje SOAP 1.2 (dian-client.js)                          │
│     ├─ Header: <wsse:Security>                                 │
│     ├─ Header: <wsa:To>                                        │
│     └─ Body: <SendBillAsync>                                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                            │
                            │ HTTPS (TLS 1.2+)
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│              SERVIDOR DIAN (Azure Front Door)                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. Recibe mensaje SOAP                                        │
│     ↓                                                           │
│  2. Verifica Timestamp                                         │
│     ├─ ¿Created < Ahora < Expires? ✓                           │
│     └─ Previene replay attacks                                 │
│     ↓                                                           │
│  3. Valida Certificado X.509                                   │
│     ├─ ¿Es de CERTICAMARA? ✓                                   │
│     ├─ ¿Está vigente? ✓                                        │
│     └─ ¿No está revocado? ✓                                    │
│     ↓                                                           │
│  4. Verifica Firma Digital                                     │
│     ├─ Recalcula Digests (SHA-256)                             │
│     ├─ Descifra SignatureValue con clave pública               │
│     ├─ Compara hashes                                          │
│     └─ ¿Coinciden? ✓ → Mensaje auténtico                       │
│     ↓                                                           │
│  5. Procesa Factura                                            │
│     ├─ Valida estructura UBL 2.1                               │
│     ├─ Verifica CUFE                                           │
│     ├─ Valida datos fiscales                                   │
│     └─ Genera respuesta                                        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ↓
                    Respuesta DIAN
              (Aceptada / Rechazada)
```

---

## 🔑 Componentes del Header WS-Security

### 1. **Timestamp** (Validez Temporal)
```xml
<wsu:Timestamp wsu:Id="TS-xxx">
  <wsu:Created>2026-01-05T05:15:40Z</wsu:Created>
  <wsu:Expires>2026-01-05T05:20:40Z</wsu:Expires>
</wsu:Timestamp>
```
**Propósito**: Previene ataques de replay (ventana de 5 minutos)

---

### 2. **BinarySecurityToken** (Certificado)
```xml
<wsse:BinarySecurityToken 
  ValueType="X509v3" 
  wsu:Id="X509-xxx">
  MIIGxTCCBa2gAwIBAgIQCn+NKTHmTHFnpT...
</wsse:BinarySecurityToken>
```
**Propósito**: Identifica al emisor con certificado CERTICAMARA
- **Subject**: EMPRESA MULTIACTIVA DE SALUD SERMULTISALUD S.A.S.
- **NIT**: 900345765
- **Válido hasta**: 06/02/2026

---

### 3. **Signature** (Firma Digital)

#### a) SignedInfo (Qué se firma)
```xml
<SignedInfo>
  <CanonicalizationMethod Algorithm="xml-exc-c14n#"/>
  <SignatureMethod Algorithm="rsa-sha256"/>
  
  <Reference URI="#TS-xxx">
    <DigestMethod Algorithm="sha256"/>
    <DigestValue>[SHA256 del Timestamp]</DigestValue>
  </Reference>
  
  <Reference URI="#_To">
    <DigestMethod Algorithm="sha256"/>
    <DigestValue>[SHA256 del To]</DigestValue>
  </Reference>
</SignedInfo>
```

#### b) SignatureValue (Firma RSA)
```xml
<SignatureValue>
  dGhpcyBpcyBhIHNpZ25hdHVyZQ==
</SignatureValue>
```
**Cálculo**: RSA-SHA256(Canonicalizar(SignedInfo), ClavePrivada)

#### c) KeyInfo (Identificación del Certificado)
```xml
<KeyInfo>
  <wsse:SecurityTokenReference>
    <wsse:KeyIdentifier ValueType="ThumbprintSHA1">
      B7DHTEQ0sn8ejLiJ3gGgrg9B9g==
    </wsse:KeyIdentifier>
  </wsse:SecurityTokenReference>
</KeyInfo>
```
**Thumbprint**: `07b0c74c21f23428f1e8cb889de01a0aae0f41f6`

---

### 4. **Header To** (Destino Firmado)
```xml
<wsa:To wsu:Id="_To">
  https://vpfe-hab.dian.gov.co/WcfDianCustomerServices.svc
</wsa:To>
```
**Propósito**: Previene redirección maliciosa del mensaje

---

## 🔐 Proceso de Firma (Simplificado)

### Emisor (Tu Sistema)
```javascript
// 1. Generar contenido
const timestamp = generarTimestamp();
const toHeader = `<wsa:To>https://dian.gov.co/...</wsa:To>`;

// 2. Calcular hashes
const digestTimestamp = SHA256(canonicalizar(timestamp));
const digestTo = SHA256(canonicalizar(toHeader));

// 3. Construir SignedInfo
const signedInfo = `
  <SignedInfo>
    <Reference URI="#TS"><DigestValue>${digestTimestamp}</DigestValue></Reference>
    <Reference URI="#_To"><DigestValue>${digestTo}</DigestValue></Reference>
  </SignedInfo>
`;

// 4. Firmar con clave privada
const signatureValue = RSA_SIGN(SHA256(signedInfo), clavePrivada);

// 5. Construir mensaje completo
const mensaje = `
  <Security>
    ${timestamp}
    ${certificado}
    <Signature>
      ${signedInfo}
      <SignatureValue>${signatureValue}</SignatureValue>
    </Signature>
  </Security>
`;
```

### Verificador (DIAN)
```javascript
// 1. Recibir mensaje
const { timestamp, certificado, signedInfo, signatureValue } = parsearMensaje();

// 2. Verificar timestamp
if (ahora < timestamp.created || ahora > timestamp.expires) {
  return ERROR("Mensaje expirado");
}

// 3. Verificar certificado
if (!certificadoValido(certificado)) {
  return ERROR("Certificado inválido");
}

// 4. Recalcular hashes
const digestTimestamp = SHA256(canonicalizar(timestamp));
const digestTo = SHA256(canonicalizar(toHeader));

// 5. Verificar digests en SignedInfo
if (signedInfo.digestTimestamp !== digestTimestamp) {
  return ERROR("Timestamp alterado");
}

// 6. Verificar firma
const clavePublica = extraerClave(certificado);
const hashCalculado = SHA256(signedInfo);
const hashDescifrado = RSA_VERIFY(signatureValue, clavePublica);

if (hashCalculado === hashDescifrado) {
  return OK("Firma válida - mensaje auténtico");
} else {
  return ERROR("Firma inválida");
}
```

---

## 🎯 Garantías de Seguridad

| Amenaza | Protección | Cómo Funciona |
|---------|-----------|---------------|
| **Suplantación** | Certificado X.509 | Solo el titular tiene la clave privada |
| **Alteración** | Firma Digital | Cualquier cambio invalida el hash SHA-256 |
| **Replay** | Timestamp | Ventana de validez de 5 minutos |
| **Man-in-Middle** | HTTPS + Firma | TLS cifra transporte, firma garantiza origen |
| **Repudio** | Firma Digital | La firma prueba autoría (no repudiable) |

---

## ✅ Estado Actual

### Certificado
- **Emisor**: CERTICAMARA S.A.
- **Titular**: EMPRESA MULTIACTIVA DE SALUD SERMULTISALUD S.A.S.
- **NIT**: 900345765
- **Tipo**: RSA 2048 bits
- **Válido hasta**: 06 de febrero de 2026
- **Thumbprint**: `07b0c74c21f23428f1e8cb889de01a0aae0f41f6`

### Configuración
- ✅ WS-Security implementado
- ✅ SOAP 1.2 configurado
- ✅ Firma XAdES-EPES activa
- ✅ CUFE calculado correctamente
- ✅ SSC calculado con SHA-384
- ✅ Servidor corriendo en puerto 3010
- ✅ `SEND_TO_DIAN=true` activado

---

## 📋 Uso del Sistema

### 1. Enviar Factura
```bash
# El servidor está escuchando en:
http://localhost:3010
```

### 2. Endpoint
```
POST /factura
Content-Type: application/json

{
  "facturaXml": "<Invoice>...</Invoice>"
}
```

### 3. Proceso Automático
1. ✅ Firma XML con XAdES-EPES
2. ✅ Calcula CUFE y SSC
3. ✅ Empaqueta en ZIP
4. ✅ Genera WS-Security header
5. ✅ Envía a DIAN con SOAP 1.2
6. ✅ Retorna respuesta de la DIAN

---

## 📚 Archivos Clave

```
ServerFEpos/
├── services/
│   ├── ws-security.js       ← Generador WS-Security
│   ├── dian-client.js       ← Cliente SOAP con autenticación
│   ├── signer.js            ← Firma XAdES-EPES
│   └── packager.js          ← Empaquetador ZIP
├── cert/
│   └── cert.p12             ← Certificado CERTICAMARA
├── docs/
│   └── WS-SECURITY-EXPLICACION.md  ← Documentación completa
├── test-ws-security.js      ← Script de prueba
└── .env                     ← Configuración
```

---

## 🎓 Conceptos Clave

### Criptografía Asimétrica (RSA)
- **Clave Privada**: Solo tú la tienes → Firmar
- **Clave Pública**: Todos la tienen → Verificar

### Hash (SHA-256)
- Función unidireccional
- Mismo input → mismo hash
- Cambio mínimo → hash totalmente diferente

### Firma Digital
1. Hash del mensaje: `H = SHA256(mensaje)`
2. Cifrar hash con clave privada: `S = RSA(H, privada)`
3. Verificar con clave pública: `H' = RSA(S, publica)`
4. Comparar: `H == H'` → válido

### Canonicalización (C14N)
- Normaliza XML para firma
- Elimina espacios inconsistentes
- Ordena atributos
- Garantiza mismo hash para contenido equivalente

---

## 🚀 Sistema Listo para Producción

El sistema está completamente configurado y listo para enviar facturas electrónicas a la DIAN con:
- ✅ Autenticación WS-Security
- ✅ Firma digital X.509
- ✅ Integridad de mensajes
- ✅ Cumplimiento normativo
