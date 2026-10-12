declare namespace App {
  interface Locals {
    actor: import('./lib/session').Actor | null;
  }
}
