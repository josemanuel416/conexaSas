# Envío a la DIAN en ambiente de pruebas sin set de habilitación

Documento técnico para desarrolladores. Describe cómo enviar documentos electrónicos al ambiente de pruebas de la DIAN **después** de que el software ya está habilitado, **sin** usar el identificador del set de pruebas (`TestSetId`) ni la operación `SendTestSetAsync`.

No cubre el trámite de habilitación inicial ni el envío a producción con validez fiscal.

---

## 1. Contexto

La DIAN expone dos puntos de servicio SOAP distintos:

| Ambiente físico | Endpoint | Uso |
|---|---|---|
| Habilitación / pruebas | `https://vpfe-hab.dian.gov.co/WcfDianCustomerServices.svc` | Validación técnica. Sin efectos fiscales. |
| Producción | `https://vpfe.dian.gov.co/WcfDianCustomerServices.svc` | Facturación real. El documento tiene validez tributaria. |

WSDL (ambos ambientes):

- HAB: `https://vpfe-hab.dian.gov.co/WcfDianCustomerServices.svc?wsdl`
- Producción: `https://vpfe.dian.gov.co/WcfDianCustomerServices.svc?wsdl`

Ambos usan el mismo contrato (`IWcfDianCustomerServices`), el mismo esquema UBL 2.1 y el mismo certificado digital del obligado. Lo que cambia es:

1. A qué host se envía el SOAP.
2. Qué operación se invoca.
3. El valor de `cbc:ProfileExecutionID` en el XML.
4. Si el documento entra o no al **gráfico de pruebas** de habilitación.

---

## 2. Tres modos operativos

No confundir “ambiente de pruebas” con “set de pruebas”. Son conceptos distintos.

### 2.1 Habilitación (con set)

Ocurre **antes** de que el software quede autorizado.

- Endpoint: `vpfe-hab`.
- Operación: **`SendTestSetAsync`**.
- Parámetros: `fileName`, `contentFile` (ZIP en Base64) y **`testSetId`**.
- El `testSetId` lo asigna la DIAN al registrar el software (catálogo de software autorizado).
- Cada documento aceptado **cuenta** en el gráfico de escenarios (factura, nota crédito, nota débito, contingencia, etc.).
- La respuesta suele ser asíncrona: la DIAN devuelve un `ZipKey` y el estado se consulta con **`GetStatusZip`**.

Mientras el set esté abierto, enviar con `SendBillSync` a HAB **no** alimenta el gráfico.

### 2.2 Pruebas (sin set) — objeto de este documento

Ocurre **después** de que el software ya está habilitado.

- Endpoint: **el mismo** `vpfe-hab`.
- Operación: **`SendBillSync`** (o `SendBillAsync`), igual que en producción.
- **No** se envía `testSetId`.
- El documento **no** suma al gráfico (el set ya está cerrado).
- La DIAN valida estructura, firma, CUFE/CUDE/CUDS, numeración y reglas de negocio **como si fuera producción**, pero el documento **no tiene validez fiscal**.

Este es el modo correcto para seguir probando integraciones, regresiones o nuevos tipos de documento sin tocar producción.

### 2.3 Producción

- Endpoint: `vpfe`.
- Operación: `SendBillSync` / `SendBillAsync`.
- Sin `testSetId`.
- `ProfileExecutionID = 1`.
- Resolución de numeración **real** autorizada por la DIAN.
- El documento es factura (o nota / documento soporte) con efectos tributarios.

---

## 3. Por qué, una vez habilitados, no se usa el set

El set de pruebas es un **expediente de habilitación**, no un canal permanente.

Cuando la DIAN declara el software habilitado:

- El `TestSetId` deja de ser el mecanismo de envío cotidiano.
- Seguir invocando `SendTestSetAsync` con un set cerrado suele devolver rechazo o no contabilizar el documento.
- El canal de pruebas posterior es el de **recepción normal** (`SendBillSync`) contra HAB.

Resumen: **habilitación = set; pruebas posteriores = mismo servicio de producción, apuntando a HAB.**

---

## 4. Identificación del ambiente en el UBL

En el XML UBL 2.1 el ambiente no se declara con el `TestSetId`. Se declara así:

```xml
<cbc:ProfileExecutionID>2</cbc:ProfileExecutionID>
```

| Valor | Significado |
|---|---|
| `1` | Producción |
| `2` | Pruebas / habilitación (HAB) |

En modo pruebas sin set:

- `ProfileExecutionID` **sigue siendo `2`**.
- El SOAP va a `vpfe-hab`.
- No hay elemento UBL para el set; el set solo existe como parámetro SOAP de `SendTestSetAsync`.

Si se envía `ProfileExecutionID = 1` a HAB, o `2` a producción, la DIAN rechaza por inconsistencia de ambiente.

---

## 5. Operación SOAP a utilizar

### 5.1 `SendBillSync` (recomendada)

Envío síncrono de un ZIP con un documento firmado.

**Entrada**

| Parámetro | Tipo | Descripción |
|---|---|---|
| `fileName` | string | Nombre del ZIP (convención DIAN, p. ej. derivado del NIT y el consecutivo). |
| `contentFile` | Base64 | ZIP que contiene el XML UBL firmado (XAdES). |

**No se envía** `testSetId`.

**Salida típica** (`SendBillSyncResult`)

- `IsValid`
- `StatusCode` (`00` = procesado correctamente)
- `StatusDescription` / `StatusMessage`
- `ErrorMessage` (lista de reglas fallidas, si las hay)
- CUFE/CUDE/CUDS y XML de aplicación de respuesta, cuando aplica

No hay cola por `ZipKey`. La validación llega en la misma llamada.

### 5.2 `SendBillAsync`

Misma semántica de documento, procesamiento diferido. La DIAN puede devolver `ZipKey`; el resultado se consulta con `GetStatusZip`. Útil ante timeouts; no es requisito del modo pruebas.

### 5.3 Lo que no debe usarse en este modo

| Operación | Cuándo sí | Cuándo no |
|---|---|---|
| `SendTestSetAsync` | Set abierto, gráfico de habilitación | Software ya habilitado, pruebas posteriores |
| `SendBillSync` a `vpfe` | Producción | Seguir “probando” en producción |
| Simulación local sin SOAP | Desarrollo de XML | Sustituir la validación de HAB |

---

## 6. Cadena de envío (sin set)

```
XML UBL 2.1
    → ProfileExecutionID = 2
    → Firma XAdES-EPES con certificado PKCS#12 del obligado
    → Empaque ZIP (un XML por ZIP en envío síncrono típico)
    → SOAP 1.2 + WS-Security (BinarySecurityToken del mismo certificado)
    → SendBillSync → vpfe-hab.dian.gov.co
    → Respuesta síncrona de validación
```

Autenticación: WS-Security con el certificado digital vigente (no usuario/contraseña). El certificado de pruebas y el de producción del obligado es el mismo; lo que cambia es el host y el `ProfileExecutionID`.

Encabezados WS-Addressing habituales:

- `Action`: `http://wcf.dian.colombia/IWcfDianCustomerServices/SendBillSync`
- `To`: URL del endpoint HAB
- `MessageID`: UUID único por petición

---

## 7. Numeración y resoluciones en pruebas

En HAB la DIAN no exige la resolución de producción. Lo habitual:

- Prefijo de factura de prueba: **SETP** (u otro prefijo de prueba asociado al software).
- Prefijo de documento soporte de prueba: **SEDS** (cuando aplica).
- Rango y número de resolución de **habilitación/pruebas**, no el de facturación real.

Una vez habilitados, ese mismo esquema de numeración de prueba se puede seguir usando contra HAB con `SendBillSync`. El consecutivo no alimenta el gráfico; solo debe ser coherente (sin saltos indebidos, dentro del rango, prefijo alineado al tipo de documento).

En pruebas es frecuente que **un mismo número de resolución de prueba** cubra factura y documento soporte, cada uno con su prefijo. En producción, factura y documento soporte suelen ir con resoluciones y prefijos distintos, autorizados por separado.

La **clave técnica** de la resolución entra en el cálculo del CUFE. Debe ser la del ambiente de pruebas, no la de la resolución de producción.

---

## 8. Qué se valida y qué no

HAB con `SendBillSync` **sí** valida, entre otros:

- Esquema UBL y extensiones DIAN.
- Firma digital y vigencia del certificado.
- CUFE / CUDE / CUDS.
- NIT, DV, datos del emisor y del adquirente.
- Prefijo, consecutivo y coherencia con la resolución informada.
- Impuestos, totales y reglas de negocio del anexo técnico vigente.
- Tipo de documento (`InvoiceTypeCode`: 01, 91, 92, 05, etc.).

**No** implica:

- Efectos fiscales ni obligación de entrega al adquirente como factura legal.
- Registro en el gráfico de habilitación.
- Uso del CUFE de pruebas como título valor o soporte tributario de producción.
- Que el QR/CUFE consultable en el portal de producción corresponda a un documento real.

El documento de pruebas es evidencia técnica de interoperabilidad, no un documento equivalente a la factura de producción.

---

## 9. Requisitos mínimos para operar en este modo

1. Software **ya habilitado** ante la DIAN.
2. Certificado digital vigente del obligado a facturar (PKCS#12).
3. `SoftwareId` y PIN del software autorizado.
4. Resolución de **pruebas** (número, prefijo, rango, vigencia, clave técnica).
5. XML con `ProfileExecutionID = 2`.
6. Cliente SOAP apuntando a **HAB**, operación **`SendBillSync`**, **sin** `testSetId`.
7. Envío real al servicio (un modo simulado no prueba la DIAN).

El código del set (`TestSetId`) puede quedar archivado por trazabilidad del proceso de habilitación. **No forma parte** de la petición de pruebas posteriores.

---

## 10. Contraste de modos

| Criterio | Habilitación (set) | Pruebas (sin set) | Producción |
|---|---|---|---|
| Host | `vpfe-hab` | `vpfe-hab` | `vpfe` |
| Operación | `SendTestSetAsync` | `SendBillSync` | `SendBillSync` |
| `TestSetId` | Obligatorio | No se envía | No se envía |
| `ProfileExecutionID` | 2 | 2 | 1 |
| Respuesta | A menudo `ZipKey` + `GetStatusZip` | Síncrona | Síncrona |
| Gráfico DIAN | Sí | No | N/A |
| Validez fiscal | No | No | Sí |
| Resolución | De prueba (p. ej. SETP) | De prueba | Autorizada real |
| Uso | Completar escenarios de habilitación | Seguir probando tras habilitados | Operación diaria |

---

## 11. Checklist de implementación

Antes de enviar un documento en modo pruebas sin set, verificar:

- [ ] El software consta como habilitado en el portal DIAN.
- [ ] El cliente SOAP usa `https://vpfe-hab.dian.gov.co/WcfDianCustomerServices.svc`.
- [ ] La operación invocada es `SendBillSync` (no `SendTestSetAsync`).
- [ ] El cuerpo SOAP **no** incluye `testSetId`.
- [ ] El UBL tiene `<cbc:ProfileExecutionID>2</cbc:ProfileExecutionID>`.
- [ ] Prefijo y resolución son de prueba (p. ej. SETP / SEDS), no de producción.
- [ ] La clave técnica usada en el CUFE es la de la resolución de pruebas.
- [ ] El certificado PKCS#12 está vigente y se usa en la firma XAdES y en WS-Security.
- [ ] `SoftwareId` y PIN corresponden al software autorizado.
- [ ] El ZIP contiene un único XML firmado y se envía en Base64.

---

## 12. Errores frecuentes

1. **Dejar el set en el envío** después de habilitados: la DIAN trata la petición como `SendTestSetAsync` sobre un set cerrado.
2. **Apuntar a producción “para probar”**: genera documentos fiscales reales.
3. **`ProfileExecutionID = 1` contra HAB** (o `2` contra producción): rechazo por ambiente.
4. **Usar clave técnica o resolución de producción en HAB**: CUFE inválido o numeración no autorizada en ese ambiente.
5. **Creer que `SendBillSync` a HAB completa el gráfico**: no lo hace; el gráfico solo cuenta `SendTestSetAsync` con set abierto.
6. **Reutilizar un CUFE de pruebas como si fuera de producción**.

---

## 13. Recomendación operativa

Tras la habilitación:

1. Cerrar el uso de `SendTestSetAsync` y del `TestSetId` en el flujo cotidiano.
2. Mantener un canal de **pruebas** = HAB + `SendBillSync` + `ProfileExecutionID = 2` + numeración SETP/SEDS.
3. Mantener un canal de **producción** = `vpfe` + `SendBillSync` + `ProfileExecutionID = 1` + resolución real.
4. No mezclar host, operación, `ProfileExecutionID` ni resolución entre canales.

Así se prueba contra las mismas reglas de la DIAN, sin set, sin gráfico y sin validez fiscal, hasta promover el documento a producción.

---

## Referencias

- Anexo técnico de factura electrónica de venta, notas débito y crédito (DIAN).
- Servicio web `WcfDianCustomerServices` — operaciones `SendBillSync`, `SendBillAsync`, `SendTestSetAsync`, `GetStatusZip`.
- UBL 2.1 — `cbc:ProfileExecutionID` (1 = producción, 2 = pruebas).
