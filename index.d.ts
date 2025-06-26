declare module 'wdio-azure-devops-reporter' {
  import type WDIOReporter from '@wdio/reporter';
  import type { Services, Options } from '@wdio/types';

  export class WdioAzureReporter extends WDIOReporter {
    constructor(options: Record<string, any>);
  }

  export class AzureDevOpsService implements Services.ServiceInstance {
    constructor(options: Record<string, any>, capabilities: any, config: Options.Testrunner);
  }

  export default WdioAzureReporter;
  export { AzureDevOpsService };
}
