# Autenticación WS-Security con Certificado X.509 - DIAN

## 📋 ¿Qué es WS-Security?

**WS-Security** (Web Services Security) es un estándar de OASIS que define cómo proporcionar:
- **Integridad**: Los mensajes no pueden ser alterados
- **Confidencialidad**: Los mensajes pueden ser cifrados
- **Autenticación**: Identifica quién envía el mensaje

La DIAN requiere WS-Security con **firma digital usando certificado X.509** para autenticar todas las solicitudes a su servicio SOAP.

---

## 🔑 Componentes de WS-Security Implementados

### 1. **BinarySecurityToken** (Certificado X.509)
```xml
<wsse:BinarySecurityToken 
  EncodingType="Base64Binary" 
  ValueType="X509v3" 
  wsu:Id="X509-...">
  [CERTIFICADO EN BASE64]
</wsse:BinarySecurityToken>
```

**Propósito**: Contiene el certificado digital completo en formato Base64.
- El certificado identifica al emisor (tu empresa)
- Contiene la clave pública para verificar firmas
- Es emitido por CERTICAMARA (autoridad certificadora)

**Cómo funciona**: 
1. Leemos el archivo `cert.p12` con la contraseña
2. Extraemos el certificado en formato DER
3. Lo convertimos a Base64 para incluirlo en el XML

---

### 2. **Timestamp** (Marca de Tiempo)
```xml
<wsu:Timestamp wsu:Id="TS-...">
  <wsu:Created>2026-01-05T05:00:00.000Z</wsu:Created>
  <wsu:Expires>2026-01-05T05:05:00.000Z</wsu:Expires>
</wsu:Timestamp>
```

**Propósito**: Previene ataques de replay (reutilización de mensajes antiguos).
- **Created**: Momento exacto de creación del mensaje
- **Expires**: Tiempo límite de validez (5 minutos)

**Cómo funciona**:
1. Generamos timestamp actual en formato ISO 8601 (UTC)
2. Calculamos expiración (Created + 5 minutos)
3. Lo firmamos junto con otros elementos para asegurar que no sea modificado

---

### 3. **Signature** (Firma Digital)
```xml
<Signature xmlns="http://www.w3.org/2000/09/xmldsig#">
  <SignedInfo>...</SignedInfo>
  <SignatureValue>[FIRMA RSA-SHA256]</SignatureValue>
  <KeyInfo>...</KeyInfo>
</Signature>
```

**Propósito**: Garantiza que el mensaje proviene de quien dice ser y no ha sido alterado.

#### 3.1. SignedInfo (Información de lo Firmado)
```xml
<SignedInfo>
  <CanonicalizationMethod Algorithm="xml-exc-c14n#"/>
  <SignatureMethod Algorithm="rsa-sha256"/>
  
  <!-- Referencia al Timestamp -->
  <Reference URI="#TS-...">
    <DigestMethod Algorithm="sha256"/>
    <DigestValue>[HASH SHA-256 DEL TIMESTAMP]</DigestValue>
  </Reference>
  
  <!-- Referencia al header To -->
  <Reference URI="#_To">
    <DigestMethod Algorithm="sha256"/>
    <DigestValue>[HASH SHA-256 DEL TO]</DigestValue>
  </Reference>
</SignedInfo>
```

**Cómo funciona**:
1. **Canonicalización**: Convertimos el XML a un formato estándar (elimina espacios, ordena atributos)
2. **Digest (Hash)**: Calculamos SHA-256 de cada elemento firmado (Timestamp, To)
3. **Referencias**: Listamos qué elementos estamos firmando mediante sus IDs

#### 3.2. SignatureValue (Valor de la Firma)
```xml
<SignatureValue>dGhpcyBpcyBhIHNpZ25hdHVyZQ==</SignatureValue>
```

**Cómo funciona**:
1. Tomamos todo el `<SignedInfo>` canonicalizado
2. Calculamos su hash SHA-256
3. **Ciframos ese hash con la CLAVE PRIVADA del certificado** (RSA)
4. El resultado en Base64 es la firma digital

**Verificación**: 
- La DIAN usará la CLAVE PÚBLICA del certificado para descifrar la firma
- Compara el hash descifrado con el hash que ella misma calcula
- Si coinciden → mensaje auténtico y sin modificar

#### 3.3. KeyInfo (Información de la Clave)
```xml
<KeyInfo>
  <wsse:SecurityTokenReference>
    <wsse:KeyIdentifier ValueType="ThumbprintSHA1">
      [THUMBPRINT DEL CERTIFICADO EN BASE64]
    </wsse:KeyIdentifier>
  </wsse:SecurityTokenReference>
</KeyInfo>
```

**Propósito**: Le dice a la DIAN qué certificado usar para verificar la firma.

**Thumbprint (Huella Digital)**:
- Es un hash SHA-1 del certificado completo
- Identifica únicamente el certificado sin enviarlo dos veces
- La DIAN busca el certificado usando este thumbprint

**Cómo lo calculamos**:
1. Tomamos el certificado en formato DER (binario)
2. Calculamos SHA-1 de esos bytes
3. Convertimos a Base64

---

### 4. **Header To** (Destino del Mensaje)
```xml
<wsa:To wsu:Id="_To" xmlns:wsa="http://www.w3.org/2005/08/addressing">
  https://vpfe-hab.dian.gov.co/WcfDianCustomerServices.svc
</wsa:To>
```

**Propósito**: Indica el endpoint de destino del mensaje.

**Por qué se firma**: 
- El WSDL de la DIAN requiere `EndorsingSupportingTokens` con `SignedParts` que incluyen el header `To`
- Esto previene que un atacante redirija el mensaje a otro servicio

---

## 🔐 Proceso de Firma Completo (Paso a Paso)

### Paso 1: Cargar Certificado
```javascript
const p12Buffer = fs.readFileSync('cert/cert.p12');
const p12 = forge.pkcs12.pkcs12FromAsn1(
  forge.asn1.fromDer(p12Buffer.toString('binary')), 
  'Certi2022*'
);
```
- Leemos el archivo P12/PFX
- Lo desciframos con la contraseña
- Extraemos certificado y clave privada

### Paso 2: Generar Timestamp
```javascript
const created = new Date().toISOString();
const expires = new Date(Date.now() + 5*60*1000).toISOString();
```
- Timestamp actual en UTC
- Expiración = ahora + 5 minutos

### Paso 3: Calcular Digests (Hashes)
```javascript
// 1. Canonicalizar XML (formato estándar)
const canonicalTimestamp = canonicalize(timestampXml);

// 2. Calcular SHA-256
const hash = crypto.createHash('sha256');
hash.update(canonicalTimestamp, 'utf8');
const digest = hash.digest('base64');
```
Repetir para el header `To`

### Paso 4: Construir SignedInfo
```javascript
const signedInfo = `
  <SignedInfo>
    <CanonicalizationMethod Algorithm="xml-exc-c14n#"/>
    <SignatureMethod Algorithm="rsa-sha256"/>
    <Reference URI="#TS-id">
      <DigestValue>${timestampDigest}</DigestValue>
    </Reference>
    <Reference URI="#_To">
      <DigestValue>${toDigest}</DigestValue>
    </Reference>
  </SignedInfo>
`;
```

### Paso 5: Firmar SignedInfo
```javascript
// 1. Canonicalizar SignedInfo
const canonical = canonicalize(signedInfo);

// 2. Calcular hash SHA-256
const md = forge.md.sha256.create();
md.update(canonical, 'utf8');

// 3. Firmar con clave privada RSA
const signature = privateKey.sign(md);
const signatureValue = forge.util.encode64(signature);
```

### Paso 6: Construir Header Security Completo
```javascript
const securityHeader = `
  <wsse:Security>
    ${timestamp}
    ${binarySecurityToken}
    <Signature>
      ${signedInfo}
      <SignatureValue>${signatureValue}</SignatureValue>
      ${keyInfo}
    </Signature>
  </wsse:Security>
`;
```

### Paso 7: Agregar al Mensaje SOAP
```javascript
client.addSoapHeader(() => securityHeader);
client.addSoapHeader(() => toHeader);
```

---

## 📨 Mensaje SOAP Final

```xml
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope">
  <soap:Header>
    <!-- Header WS-Security -->
    <wsse:Security>
      <wsu:Timestamp wsu:Id="TS-xxx">...</wsu:Timestamp>
      <wsse:BinarySecurityToken>...</wsse:BinarySecurityToken>
      <Signature>
        <SignedInfo>...</SignedInfo>
        <SignatureValue>...</SignatureValue>
        <KeyInfo>...</KeyInfo>
      </Signature>
    </wsse:Security>
    
    <!-- Header To (firmado) -->
    <wsa:To wsu:Id="_To">https://vpfe-hab.dian.gov.co/...</wsa:To>
  </soap:Header>
  
  <soap:Body>
    <SendBillAsync>
      <fileName>invoice_xxx.zip</fileName>
      <contentFile>[ZIP EN BASE64]</contentFile>
    </SendBillAsync>
  </soap:Body>
</soap:Envelope>
```

---

## ✅ Verificación por la DIAN

Cuando la DIAN recibe el mensaje:

1. **Verifica Timestamp**: 
   - ¿Está dentro del periodo de validez?
   - ¿Created < ahora < Expires?

2. **Extrae el Certificado**:
   - Lee el `BinarySecurityToken`
   - Verifica que sea válido y de una CA autorizada (CERTICAMARA)

3. **Verifica la Firma**:
   - Recalcula los digests de Timestamp y To
   - Compara con los valores en `<DigestValue>`
   - Descifra `<SignatureValue>` con la clave pública del certificado
   - Verifica que coincida con el hash de `<SignedInfo>`

4. **Verifica Identidad**:
   - El NIT en el certificado debe coincidir con el emisor de la factura
   - El certificado debe estar activo y no revocado

5. **Procesa el Mensaje**:
   - Si todo es válido, procesa el contenido del `<soap:Body>`

---

## 🛡️ Seguridad Garantizada

### ¿Qué previene esto?

1. **Suplantación de Identidad**: 
   - Solo quien tiene la clave privada puede firmar
   - El certificado es emitido solo al titular (tu empresa)

2. **Alteración de Mensajes**:
   - Cualquier cambio invalida la firma digital
   - Los digests SHA-256 detectan modificaciones

3. **Replay Attacks**:
   - El timestamp previene reutilizar mensajes viejos
   - Cada mensaje expira en 5 minutos

4. **Man-in-the-Middle**:
   - HTTPS cifra el transporte
   - La firma garantiza origen auténtico

---

## 🔧 Configuración Actual

### Archivos Involucrados
- `services/ws-security.js` - Módulo de generación de headers WS-Security
- `services/dian-client.js` - Cliente SOAP con autenticación
- `cert/cert.p12` - Certificado X.509 (CERTICAMARA)
- `.env` - Contraseña del certificado

### Variables de Entorno
```env
CERT_PASS=Certi2022*                    # Contraseña del certificado
DIAN_ENV=habilitacion                    # Ambiente DIAN
SEND_TO_DIAN=true                        # Activar envío real
```

### Uso
```javascript
const wsSecurity = new WSSecurityCert('cert/cert.p12', 'Certi2022*');
wsSecurity.addSecurityToClient(client, 'https://vpfe-hab.dian.gov.co/...');
```

---

## 📚 Estándares Implementados

- **WS-Security 1.1**: Core security framework
- **XML Signature**: Firmas digitales XML (XMLDSig)
- **X.509 Certificate Token Profile**: Uso de certificados X.509
- **SOAP Message Security**: Seguridad de mensajes SOAP
- **WS-Addressing**: Headers de direccionamiento (To)
- **Canonical XML (C14N)**: Normalización de XML
- **RSA-SHA256**: Algoritmo de firma digital
- **SHA-256**: Función hash para digests

---

## 🎯 Resultado

Con esta implementación, cada mensaje enviado a la DIAN incluye:
- ✅ Certificado digital válido (CERTICAMARA)
- ✅ Firma digital RSA-SHA256
- ✅ Timestamp con validez de 5 minutos
- ✅ Integridad de mensaje garantizada
- ✅ Autenticación de emisor verificable
- ✅ Cumplimiento del WSDL de la DIAN
