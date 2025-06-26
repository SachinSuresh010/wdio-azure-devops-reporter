import { AzureDevOpsClient } from "./azureDevOpsClient.js";
import fs from "fs";
import path from "path";

export default class AzureDevOpsService {
    constructor(options, _capabilities, _config) {
        this.options = options;
        this.azureClient = new AzureDevOpsClient(options);
    }

    async onPrepare(config, capabilities) {
        // Allow user to provide suiteId directly, or via suiteMapping
        let suiteId = this.options.suiteId;
        let suiteName = config.suite || 'e2e';
        if (!suiteId && this.options.suiteMapping) {
            suiteId = this.options.suiteMapping[suiteName];
        }
        if (!suiteId) {
            console.error('Azure DevOps Service: Suite ID not found');
            return;
        }
        // Allow user to provide runName, otherwise default
        let runName = this.options.runName || `WDIO Run for Suite: ${suiteName}`;

        this.options.suiteId = suiteId;
        this.options.runName = runName;

        const run = await this.azureClient.createTestRun(
            this.options.planId,
            suiteId
        );
        this.options.testRunId = run.id;
        this.azureClient.currentTestRunId = run.id;

        fs.writeFileSync(
            path.join(process.cwd(), "test-run-meta.json"),
            JSON.stringify({ testRunId: run.id })
        );
    }

    async onComplete(exitCode, config, capabilities, results) {
        // Attach report if configured
        if (this.options.attachReport) {
            const {
                type,
                path: reportPath,
                name,
                comment,
                iterationId
            } = this.options.attachReport;
            try {
                if (fs.existsSync(reportPath)) {
                    const reportBuffer = fs.readFileSync(reportPath);
                    const reportBase64 = reportBuffer.toString('base64');
                    await this.azureClient.addRunAttachment(
                        name,
                        reportBase64,
                        comment || `${type} Report`,
                        iterationId
                    );
                    console.log(`Azure DevOps Service: Attached ${type} report (${name})`);
                } else {
                    console.warn(`Azure DevOps Service: Report file not found at path: ${reportPath}`);
                }
            } catch (err) {
                console.error(`Azure DevOps Service: Failed to attach report: ${err.message}`);
            }
        }
        await this.azureClient.completeTestRun("Completed");
    }
}
