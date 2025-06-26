# wdio-azure-devops-reporter

A custom WebdriverIO reporter and service for integrating test results and artifacts (screenshots, HTML/Allure reports, etc.) with Azure DevOps Test Plans.

## Features

- Uploads test results and failure screenshots to Azure DevOps Test Plans
- Attaches HTML/Allure reports to all test results in a run
- Flexible configuration for suite mapping, run naming, and artifact paths
- Works as both a WDIO reporter and service

## Installation

```sh
npm install wdio-azure-devops-reporter --save-dev
```

## Usage

1. **Add the reporter/service to your `wdio.conf.js`:**

```js
import WdioAzureReporter, { AzureDevOpsService } from 'wdio-azure-devops-reporter';

const azureDevOpsConfig = {
    organization: 'your-azure-org',
    project: 'your-azure-project',
    planId: 1234, // Azure DevOps Test Plan ID
    pat: process.env.AZURE_PAT, // Personal Access Token
    suiteId: 5678, // Directly specify a suiteId
    // suiteMapping: { // (optional) Map WDIO suite names to Azure suite IDs
    //     e2e: 5678,
    //     regression: 91011
    // },
    runName: 'My Custom Test Run', // (optional) Custom run name
    attachReport: {
        type: 'jsonHtml', // or 'allure'
        path: '.artifacts/test-report.html',
        name: 'test-report.html',
        comment: 'HTML JSON Report',
        iterationId: 1
    }
};

export const config = {
    // ...
    services: [
        [AzureDevOpsService, azureDevOpsConfig]
    ],
    reporters: [
        // ...
        [WdioAzureReporter, {
            ...azureDevOpsConfig,
            screenshotPath: '.artifacts/screenshots' // (optional)
        }]
    ],
    // ...
};
```

2. **Environment Variables:**

- Set your Azure DevOps Personal Access Token as an environment variable (recommended):

```sh
export AZURE_PAT=your-pat-here
```

## Configuration Options

| Option         | Type     | Description |
|----------------|----------|-------------|
| organization   | string   | Azure DevOps organization name |
| project        | string   | Azure DevOps project name |
| planId         | number   | Azure DevOps Test Plan ID |
| pat            | string   | Azure DevOps Personal Access Token |
| suiteId        | number   | Directly specify a suiteId |
| suiteMapping   | object   | (optional) Map WDIO suite names to Azure suite IDs |
| runName        | string   | (optional) Custom run name for the test run |
| attachReport   | object   | (optional) Attach a report to all test results. See below. |
| screenshotPath | string   | (optional, reporter only) Where to save failure screenshots |

### `attachReport` object

| Option      | Type   | Description |
|-------------|--------|-------------|
| type        | string | 'jsonHtml', 'allure', etc. |
| path        | string | Path to the report file |
| name        | string | Name for the attachment in Azure DevOps |
| comment     | string | (optional) Attachment comment |
| iterationId | number | (optional) Iteration ID |

## Example

```js
const azureDevOpsConfig = {
    organization: 'testOrganization',
    project: 'testProject',
    planId: 1234,
    pat: process.env.AZURE_PAT,
    suiteMapping: {
        e2e: 1235,
        homePage: 1236,
        authentication: 1237,
    },
    runName: 'Nightly Regression',
    attachReport: {
        type: 'jsonHtml',
        path: '.artifacts/test-report.html',
        name: 'test-report.html',
        comment: 'HTML JSON Report',
        iterationId: 1,
    }
};
```

## License

MIT
