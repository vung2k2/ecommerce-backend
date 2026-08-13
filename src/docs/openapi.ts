import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'E-commerce Backend API',
      version: '0.1.0',
      description: 'Swagger REST API Documentation for E-commerce Backend application.',
    },
    servers: [{ url: '/api/v1' }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
  },
  apis: ['./src/modules/**/*.ts', './src/routes/**/*.ts', './src/middlewares/**/*.ts'],
};

export const openApiDocument = swaggerJsdoc(options);
