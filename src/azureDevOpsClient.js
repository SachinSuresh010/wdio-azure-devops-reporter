import axios from 'axios';

class AzureDevOpsClient {
    constructor(config) {
        if (!config || !config.organization || !config.project || !config.pat) {
            throw new Error('AzureDevOpsClient: Missing required configuration (organization, project, plainPat).');
        }
        this.config = config;
        this.baseUrl = `https://dev.azure.com/${config.organization}/${config.project}/_apis`;

        this.axiosInstance = axios.create({
            baseURL: this.baseUrl,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Basic ${Buffer.from(':' + this.config.pat).toString('base64')}`
            },
            params: {
                'api-version': '7.1'
            }
        });

        this.currentTestRunId = null;
        this.testPointMappings = [];
        this.testResultMappings = {};
    }

    /**
     * Fetches test points for a given test plan and suite.
     * Populates `testPointMappings` with "TestCaseName" -> "TestPointId".
     * @param {string | number} planId - The ID of the test plan.
     * @param {string | number} suiteId - The ID of the test suite.
     * @returns {Promise<Array<object>>} - Array of test point objects.
     */
    async getTestPoints(planId, suiteId) {
        console.log('Fetching test points...');
        const urlPath = `/test/Plans/${planId}/Suites/${suiteId}/points`;
        const responseData = await this.axiosInstance.get(urlPath);

        this.testPointMappings = responseData.data.value.map(item => item.id)
        console.log(`Fetched ${responseData.data.value.length} test points. Mappings (TestCaseName: TestPointId):`, this.testPointMappings);
        return responseData.data.value;
    }

    /**
     * Creates a new test run in Azure DevOps.
     * Populates `currentTestRunId` and `azureTestCaseIdToResultIdMap`.
     * @param {string | number} planId - The ID of the test plan.
     * @param {string | number} suiteId - The ID of the test suite.
     * @returns {Promise<object>} - Details of the created test run.
     */
    async createTestRun(planId, suiteId) {
        console.log('Creating a new test run...');

        await this.getTestPoints(planId, suiteId);
        const payload = {
            name: this.config.runName,
            plan: { id: parseInt(planId) },
            pointIds: this.testPointMappings,
            automated: true,
        };

        const urlPath = `/test/runs`;

        const responseData = await this.axiosInstance.post(urlPath, payload);

        this.currentTestRunId = responseData.data.id;
        // this.azureTestCaseIdToResultIdMap = new Map(); // Clear previous map

        console.log(`Test Run created with ID: ${this.currentTestRunId}`);
        return responseData.data;
    }

    async getTestResults(runId, testCaseId){
        if (!runId) {
            console.warn('AzureDevOpsClient: currentTestRunId is not set. Cannot get test results.');
            return null;
        }

        const urlPath = `/test/runs/${runId}/results`;
        const params = {
            'detailsToInclude': 5
        }
        const responseData = await this.axiosInstance.get(urlPath, params);

        const result = responseData.data.value.find(item => item.testCase.id === testCaseId);

        if (!result) {
            console.warn(`AzureDevOpsClient: No test result found for testCaseId: ${testCaseId} in runId: ${runId}.`);
            return null;
        }

        let resultId = result.id;
        this.testResultMappings = {
            "testCaseId": testCaseId,
            "testResultId": resultId
        }
        return this.testResultMappings;
    }

    async updateTestResults(results) {
        if (!this.currentTestRunId) {
            console.warn('No active test run ID. Cannot update test results.');
            return;
        }
        console.log(`Updating results for Test Run ID: ${this.currentTestRunId}`);

        const payload = results.map(result => ({
            id: result.id,
            outcome: result.outcome,
            state: 'Completed',
            comment: result.comment,
            durationInMs: result.durationInMs,
            iterationDetails: result.iterationDetails? result.iterationDetails : []
        }));

        const urlPath = `/test/runs/${this.currentTestRunId}/results`;
        try{
            await this.axiosInstance.patch(urlPath, payload);
        } catch (error) {
            console.log(error)
        }
        console.log('Test results updated successfully.');
    }

    async addAttachment(testResultId, fileName, fileContentBase64, comment = 'Test attachment', iterationId = null) {
        if (!this.currentTestRunId) {
            console.warn('No active test run ID. Cannot add attachment.');
            return;
        }
        console.log(`Adding attachment for Test Result ID: ${testResultId}`);

        const payload = {
            attachmentType: 'GeneralAttachment',
            comment: comment,
            fileName: fileName,
            stream: fileContentBase64,
        };

        const axiosConfig = {}; // Create an empty config object

        // Add iterationId to the 'params' object within the config if it's provided
        if (iterationId !== null && iterationId !== undefined) {
            axiosConfig.params = { // Create the params object if it doesn't exist
                iterationId: iterationId
            };
        }
        const urlPath = `/test/runs/${this.currentTestRunId}/results/${testResultId}/attachments/`;
        await this.axiosInstance.post(urlPath, payload, axiosConfig);
        console.log(`Attachment '${fileName}' added successfully.`);
    }

    async addRunAttachment(fileName, fileContentBase64, comment = 'Test attachment', iterationId = null) {
        if (!this.currentTestRunId) {
            console.warn('No active test run ID. Cannot add attachment.');
            return;
        }
        console.log(`Adding attachment for Test Run ID: ${this.currentTestRunId}`);

        const payload = {
            attachmentType: 'GeneralAttachment',
            comment: comment,
            fileName: fileName,
            stream: fileContentBase64,
        };

        const axiosConfig = {}; // Create an empty config object

        // Add iterationId to the 'params' object within the config if it's provided
        if (iterationId !== null && iterationId !== undefined) {
            axiosConfig.params = { // Create the params object if it doesn't exist
                iterationId: iterationId
            };
        }
        const urlPath = `/test/runs/${this.currentTestRunId}/attachments/`;
        await this.axiosInstance.post(urlPath, payload, axiosConfig);
        console.log(`Attachment '${fileName}' added successfully.`);
    }

    async completeTestRun(state) {
        if (!this.currentTestRunId) {
            console.warn('No active test run ID. Cannot complete test run.');
            return;
        }
        console.log(`Completing Test Run ID: ${this.currentTestRunId}`);

        const payload = {
            state: state,
        };

        const urlPath = `/test/runs/${this.currentTestRunId}`;
        await this.axiosInstance.patch(urlPath, payload);
        console.log('Test run completed successfully.');
        this.currentTestRunId = null;
        this.testPointMappings = {};
        this.azureTestCaseIdToResultIdMap = new Map(); // Clear map after completion
    }
}

export { AzureDevOpsClient };