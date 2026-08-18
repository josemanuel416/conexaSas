# 📌 Archivos de Referencia - Validados por DIAN

## 🎯 Propósito

Esta carpeta contiene archivos XML que **ya fueron aceptados exitosamente por la DIAN**.

Estos archivos sirven como referencia para validar que la firma que genera el sistema actual sea correcta.

## 📥 Cómo Usar

1. **Obtén un archivo XML firmado y validado** de:
   - Sistema anterior de facturación
   - Proveedor tecnológico (Fecosoft, Alegra, etc.)
   - Pruebas exitosas en ambiente de habilitación DIAN
   - Facturas de producción ya aceptadas

2. **Cópialo aquí** con nombre descriptivo:
   ```
   validados_dian/
   ├── factura_fecosoft_ejemplo.xml
   ├── factura_produccion_2025.xml
   └── factura_habilitacion_test.xml
   ```

3. **Úsalo para comparar** con los archivos generados en `firmados/`

## ✅ Características de un Archivo Válido

- ✅ Fue enviado a DIAN y recibió respuesta exitosa (código 00)
- ✅ Contiene el nodo `<ds:Signature>` completo
- ✅ Tiene el `<X509Certificate>` del certificado usado
- ✅ La firma está en la ubicación correcta (segundo UBLExtension)

## 🔍 Qué Comparar

Al comparar con archivos de `firmados/`:

| Elemento | Debe Coincidir | Puede Variar |
|----------|---------------|--------------|
| Ubicación de `<ds:Signature>` | ✅ SÍ | |
| Algoritmo de firma (rsa-sha256) | ✅ SÍ | |
| Método digest (sha256) | ✅ SÍ | |
| Estructura de `<SignedInfo>` | ✅ SÍ | |
| Valor de `<DigestValue>` | | ✅ SÍ (único por doc) |
| Valor de `<SignatureValue>` | | ✅ SÍ (único por doc) |
| Contenido `<X509Certificate>` | ✅ SÍ* | |

*Si usas el mismo certificado .p12

## 💡 Ejemplo de Comparación

```bash
# Ver estructura lado a lado
code --diff validados_dian/referencia.xml firmados/1736036414000_signed.xml

# O buscar diferencias específicas
Select-String "<ds:Signature" validados_dian/referencia.xml
Select-String "<ds:Signature" firmados/1736036414000_signed.xml
```

## 📝 Notas

- **NO subas estos archivos a Git** - Pueden contener información sensible
- Guarda copias de seguridad en lugar seguro
- Actualiza cuando cambies de certificado o proveedor
- Verifica que sean de la misma versión UBL (2.1)

---

**Estado**: Esta carpeta está lista para recibir archivos de referencia.
