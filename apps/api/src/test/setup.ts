process.env.NODE_ENV = 'test'
process.env.DATABASE_URL =
  process.env.DATABASE_URL_TEST ??
  'postgresql://controlliga:controlliga_dev@localhost:5432/controlliga_test?schema=public'
