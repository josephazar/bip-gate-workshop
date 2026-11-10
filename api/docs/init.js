// Starts Swagger UI on /openapi.yaml. It is a separate file because the page's security policy allows no inline scripts.
window.onload = () => {
  window.ui = SwaggerUIBundle({
    url: '/openapi.yaml',
    dom_id: '#swagger-ui',
    deepLinking: true,
    validatorUrl: null,           // never send our description to an outside validator
    tryItOutEnabled: true,        // the forms are open: fill, Execute
    displayRequestDuration: true,
    docExpansion: 'list',
    presets: [SwaggerUIBundle.presets.apis],
  });
};
