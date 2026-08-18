# 📁 Carpetas de Comparación de Firmas

## 📂 Estructura

### `firmados/`
Archivos XML firmados por el sistema con tu certificado CERTICAMARA.
- Cada archivo tiene timestamp único
- Formato: `{timestamp}_signed.xml`
- Estos archivos contienen la firma digital generada por el servidor

### `validados_dian/`
Archivos XML de referencia que ya fueron validados exitosamente por la DIAN.
- Coloca aquí archivos que SABES que fueron aceptados por la DIAN
- Úsalos como referencia para comparar la estructura de firma

## 🔍 Cómo Comparar

### 1. Obtener archivo validado por DIAN
Coloca en `validados_dian/` un archivo XML que ya fue aceptado por la DIAN (por ejemplo, de tu sistema anterior o de pruebas exitosas).

### 2. Generar firma con el sistema
Envía una factura a través de http://localhost:3010 - Se guardará automáticamente en `firmados/`

### 3. Comparar estructura
Abre ambos archivos y compara:

**Elementos a verificar:**
- ✅ Nodo `<ds:Signature>` presente en ambos
- ✅ Algoritmos de firma coinciden (RSA-SHA256)
- ✅ Estructura del `<SignedInfo>`
- ✅ Presencia de `<X509Certificate>`
- ✅ Ubicación de la firma (debe estar en el segundo `UBLExtension`)

### 4. Herramientas de comparación
```bash
# Usando VS Code
code --diff validados_dian/archivo_referencia.xml firmados/1234567890_signed.xml

# O abrir ambos archivos lado a lado en cualquier editor
```

## 📋 Checklist de Validación

Antes de enviar a DIAN real (`SEND_TO_DIAN=true`), verifica:

- [ ] El `<ds:Signature>` está dentro del segundo `<ext:UBLExtension>`
- [ ] El `<SignatureMethod>` es `rsa-sha256`
- [ ] El `<DigestMethod>` es `sha256`
- [ ] El certificado `<X509Certificate>` está presente
- [ ] El `<DigestValue>` se genera correctamente
- [ ] El `<SignatureValue>` existe y no está vacío
- [ ] La estructura general coincide con tu archivo validado

## 💡 Ejemplo de Uso

1. **Obtén un XML ya validado** (de tu sistema anterior, de Fecosoft, etc.)
   ```bash
   # Copia aquí
   copy C:\ruta\al\archivo\validado.xml validados_dian\referencia.xml
   ```

2. **Genera uno nuevo** desde http://localhost:3010

3. **Compara**
   ```bash
   # Ver diferencias
   fc validados_dian\referencia.xml firmados\1234567890_signed.xml
   ```

## ⚠️ Notas Importantes

- Los valores de `DigestValue` y `SignatureValue` serán DIFERENTES en cada firma (es normal)
- La estructura y los algoritmos deben ser IGUALES
- El certificado `<X509Certificate>` será el mismo si usas el mismo .p12
- La ubicación del nodo `<ds:Signature>` debe ser idéntica

## 🎯 Objetivo

Asegurar que la firma que genera este sistema sea **estructuralmente idéntica** a la que acepta la DIAN, antes de enviar facturas reales.
