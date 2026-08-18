# Certificados por compañía (DevConexa)

Esta carpeta recibe los certificados `.p12` sincronizados desde **Sever.Conexa** al subirlos en **Configurar emisor DIAN**.

Estructura por compañía:

```
companies/
  {companyId}/
    cert.p12      # Certificado digital
    cert.env      # CERT_PASS (solo uso local del servicio)
    meta.json     # Metadatos de sincronización
```

ServerFEpos aún puede usar un certificado global en `cert/cert.p12` (legacy). Con el header `X-Company-Id`, el servicio lee:

```
companies/
  {companyId}/
    cert.p12
    cert.env      # CERT_PASS, SOFTWARE_ID, DIAN_ENV
    meta.json     # softwareId, nit, dianEnvironment
```

Sever.Conexa envía además `X-Dian-Technical-Key` (clave técnica de la resolución) por cada factura.
