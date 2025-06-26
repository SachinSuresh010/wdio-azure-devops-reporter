// This file acts as the entry point for your npm package.
// It exports the main reporter class.

import { WdioAzureReporter } from './src/wdioAzureReporter.js';
import AzureDevOpsService from './src/azureDevOpsService.js';

export default WdioAzureReporter;
export { AzureDevOpsService };