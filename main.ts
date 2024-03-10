import { normalize } from "https://deno.land/std@0.41.0/path/mod.ts";

export function add(a: number, b: number): number {
  return a + b;
}

type PgConfig = {
  version: string;
  dbName: string;
  port: string;
};

function dockerComposeFile(
  projectName: string,
  pg: PgConfig,
): string {
  return `
version: '3'

services:
  ${projectName}-db:
    image: postgres:latest
    container_name: ${projectName}-db
    restart: always
    environment:
      POSTGRES_USER: devuser
      POSTGRES_PASSWORD: devuser
      POSTGRES_DB: ${pg.dbName}
    ports:
      - ${pg.port}:5432
    volumes:
      - ./data:/var/lib/postgresql/data
      - ./init:/docker-entrypoint-initdb.d
  `;
}

function taskFile(
  projectName: string,
  pg: PgConfig,
): string {
  return `
# https://taskfile.dev

version: '3'

vars:
  DB_NAME: ${pg.dbName}
  DB_PORT: ${pg.port}
  DB_USER: devuser
  DB_PASS: devuser

tasks:
  default:
    cmd: task --list-all
  docker:
    dir: docker
    cmd: docker compose restart
  db:
    cmd: docker run -e PGPASSWORD={{.DB_PASS}} --rm -it --net=host postgres:${pg.version} psql -h localhost -U {{.DB_USER}} -p {{.DB_PORT}} {{.DB_NAME}}
  db-reset:
    cmd: docker run -e PGPASSWORD={{.DB_PASS}} --rm -i --net=host postgres:${pg.version} psql -h localhost -U {{.DB_USER}} -p {{.DB_PORT}} {{.DB_NAME}} < ./db/reset.sql
  db-migrate:
    vars:
      FLAGS: '{{default "--dry-run" .FLAGS}}'
    cmd: psqldef -h localhost -U {{.DB_USER}} -p {{.DB_PORT}} {{.DB_NAME}} -W {{.DB_PASS}} {{.FLAGS}} < ./db/schema.sql
  db-seed:
    cmd: docker run -e PGPASSWORD={{.DB_PASS}} --rm -i --net=host postgres:${pg.version} psql -h localhost -U {{.DB_USER}} -p {{.DB_PORT}} {{.DB_NAME}} < ./db/seed.sql
  db-migrate-apply:
    cmds:
      - task: db-migrate
        vars: { FLAGS: "--enable-drop-table"}
  db-init:
    cmds:
      - task: db-reset
      - task: db-migrate-apply
      - task: db-seed
  jaeger:
    cmd: docker run --rm
      -e COLLECTOR_ZIPKIN_HOST_PORT=:9411
      -p 16686:16686
      -p 4317:4317
      -p 4318:4318
      -p 9411:9411
      jaegertracing/all-in-one:latest`;
}

if (import.meta.main) {
  const execDir = import.meta.dirname;
  const targetDir = Deno.args[0] || "";
  const path = normalize(`${execDir}/${targetDir}`);

  const projectName = prompt("What is project name? > ");
  const dbPort = prompt("DB Port? > ");

  if (projectName === null || dbPort === null) {
    Deno.exit();
  }
  const dbName = projectName.replace("-", "_");
  const pgConfig = {
    version: "latest",
    dbName: dbName,
    port: dbPort,
  };

  const dockerDir = `${path}/docker`;
  Deno.mkdir(dockerDir);
  const composeFileContent = dockerComposeFile(projectName, pgConfig);
  Deno.writeTextFile(`${dockerDir}/compose.yaml`, composeFileContent);

  const dbDir = `${path}/db`;
  Deno.mkdir(dbDir);
  Deno.writeTextFile(`${dbDir}/schema.sql`, "");
  Deno.writeTextFile(`${dbDir}/reset.sql`, "");
  Deno.writeTextFile(`${dbDir}/seed.sql`, "");

  const taskFileContent = taskFile(projectName, pgConfig);
  Deno.writeTextFile(`${path}/Taskfile.yaml`, taskFileContent);
}
